<script setup>
import { ref, watch } from 'vue'
import { apiClient } from '@/lib/api'
import { deviceStore } from '@/lib/deviceStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps({
  modelValue: Boolean,
  title: {
    type: String,
    default: '设备认证'
  },
  description: {
    type: String,
    default: '请输入设备 UUID 和密码'
  },
  closable: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'success'])

const isLoading = ref(false)
const showPassword = ref(false)
const deviceUuid = ref('')
const devicePassword = ref('')

// 监听对话框打开，自动填充 UUID
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    const uuid = deviceStore.getDeviceUuid()
    if (uuid) {
      deviceUuid.value = uuid
    }
  }
})

// 关闭对话框
const closeDialog = () => {
  if (props.closable) {
    emit('update:modelValue', false)
  }
}

// 验证并登录
const handleAuth = async () => {
  if (!deviceUuid.value) {
    toast.error('请输入设备 UUID')
    return
  }
  if (!devicePassword.value) {
    toast.error('请输入设备密码')
    return
  }

  isLoading.value = true
  try {
    // 尝试通过 UUID 和密码验证设备
    const deviceInfo = await apiClient.verifyDevicePassword(deviceUuid.value, devicePassword.value)

    // 验证成功，保存到 deviceStore
    deviceStore.setDeviceUuid(deviceUuid.value)

    toast.success('认证成功')
    emit('success', deviceUuid.value, devicePassword.value, deviceInfo)
  } catch (error) {
    toast.error('认证失败：' + error.message)
  } finally {
    isLoading.value = false
  }
}

// 切换密码可见性
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="(val) => closable && emit('update:modelValue', val)">
    <DialogContent class="sm:max-w-[500px]" :closable="closable">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- UUID 输入 -->
        <div class="space-y-2">
          <Label for="device-uuid">设备 UUID *</Label>
          <Input
            id="device-uuid"
            v-model="deviceUuid"
            placeholder="输入设备 UUID"
            @keyup.enter="handleAuth"
          />
        </div>

        <!-- 密码输入 -->
        <div class="space-y-2">
          <Label for="device-password">设备密码 *</Label>
          <div class="relative">
            <Input
              id="device-password"
              :type="showPassword ? 'text' : 'password'"
              v-model="devicePassword"
              placeholder="输入设备密码"
              @keyup.enter="handleAuth"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              @click="togglePasswordVisibility"
              tabindex="-1"
            >
              <Eye v-if="!showPassword" class="h-4 w-4 text-muted-foreground" />
              <EyeOff v-else class="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          v-if="closable"
          type="button"
          variant="outline"
          @click="closeDialog"
          :disabled="isLoading"
        >
          取消
        </Button>
        <Button
          type="button"
          @click="handleAuth"
          :disabled="isLoading"
        >
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          确认
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
