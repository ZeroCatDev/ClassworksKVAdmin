import axios from 'axios'
import { deviceStore } from './deviceStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3030'
const SITE_KEY = import.meta.env.VITE_SITE_KEY || ''

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-site-key': SITE_KEY,
  },
})

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 设备注册去重（避免并发重复注册）
const registrationLocks = new Map()

function getHeaderIgnoreCase(headers = {}, key) {
  if (!headers) return undefined
  const lowerKey = key.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lowerKey) return headers[k]
  }
  return undefined
}

function extractUuidFromUrl(url = '') {
  try {
    const path = url || ''
    // /apps/devices/{uuid}/...
    let m = path.match(/\/apps\/devices\/([0-9a-fA-F-]{8,})/)
    if (m) return m[1]
    // /devices/{uuid}/...
    m = path.match(/\/devices\/([0-9a-fA-F-]{8,})/)
    if (m) return m[1]
    // /accounts/device/{uuid}
    m = path.match(/\/accounts\/device\/([0-9a-fA-F-]{8,})/)
    if (m) return m[1]

    // query ?uuid=...
    const qIndex = path.indexOf('?')
    if (qIndex >= 0) {
      const usp = new URLSearchParams(path.slice(qIndex + 1))
      const q = usp.get('uuid')
      if (q) return q
    }
  } catch (e) {
    // ignore
  }
  return undefined
}

async function ensureDeviceRegistered(uuid, authHeader) {
  if (!uuid) return false
  if (registrationLocks.has(uuid)) {
    try {
      await registrationLocks.get(uuid)
      return true
    } catch {
      return false
    }
  }
  const deviceName = '未命名设备'
  const headers = {}
  if (authHeader) headers['Authorization'] = authHeader

  const p = axiosInstance.post(
    '/devices',
    { uuid, deviceName },
    { headers, // 避免递归触发注册重试
      skipDeviceRegistrationRetry: true,
      __isRegistrationRequest: true }
  )
  registrationLocks.set(uuid, p)
  try {
    await p
    // 保存UUID到本地存储，确保后续可用
    try { deviceStore.setDeviceUuid(uuid) } catch {}
    return true
  } catch (e) {
    return false
  } finally {
    registrationLocks.delete(uuid)
  }
}

// 响应拦截器（含自动注册并重试）
axiosInstance.interceptors.response.use(
  (response) => {
    return response.data
  },
  async (error) => {
    const config = error.config || {}
    const skip = config.skipDeviceRegistrationRetry || config.__isRegistrationRequest
    const backendMessage = error.response?.data?.message
    const message = backendMessage || error.message || 'Unknown error'

    // 仅在后端提示设备不存在时尝试注册并重试，且保证只重试一次
    if (!skip && !config.__retriedAfterRegistration && typeof backendMessage === 'string' && backendMessage.startsWith('设备不存在')) {
      // 从 headers / url / body 提取 uuid
      const uuidFromHeader = getHeaderIgnoreCase(config.headers, 'x-device-uuid')
      const uuidFromUrl = extractUuidFromUrl(config.url)
      let uuid = uuidFromHeader || uuidFromUrl || deviceStore.getDeviceUuid()
      if (!uuid && config.data) {
        try {
          const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
          if (body && typeof body === 'object' && body.uuid) uuid = body.uuid
        } catch {}
      }

      // 可能需要账户授权头
      const authHeader = getHeaderIgnoreCase(config.headers, 'Authorization')

      if (uuid) {
        const ok = await ensureDeviceRegistered(uuid, authHeader)
        if (ok) {
          try {
            config.__retriedAfterRegistration = true
            // 原样重试
            const retryResp = await axiosInstance.request(config)
            return retryResp
          } catch (retryErr) {
            const retryMsg = retryErr?.response?.data?.message || retryErr.message || message
            return Promise.reject(new Error(retryMsg))
          }
        }
      }
    }

    return Promise.reject(new Error(message))
  }
)

export default axiosInstance
