<script setup lang="ts">
defineProps<{
  micEnabled: boolean
  camEnabled: boolean
  sharingScreen: boolean
}>()

const emit = defineEmits<{
  toggleMic: []
  toggleCam: []
  toggleScreen: []
  openDevices: []
  leave: []
}>()
</script>

<template>
  <div class="flex items-center gap-2 rounded-2xl bg-elevated/95 backdrop-blur-md px-3 py-2 ring-1 ring-default shadow-lg">
    <UButton
      :variant="micEnabled ? 'soft' : 'solid'"
      :color="micEnabled ? 'neutral' : 'error'"
      size="md"
      :icon="micEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
      :aria-label="micEnabled ? 'Mute microphone' : 'Unmute microphone'"
      @click="emit('toggleMic')"
    />
    <UButton
      :variant="camEnabled ? 'soft' : 'solid'"
      :color="camEnabled ? 'neutral' : 'error'"
      size="md"
      :icon="camEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
      :aria-label="camEnabled ? 'Turn off camera' : 'Turn on camera'"
      @click="emit('toggleCam')"
    />
    <UButton
      :variant="sharingScreen ? 'solid' : 'soft'"
      :color="sharingScreen ? 'primary' : 'neutral'"
      size="md"
      :icon="sharingScreen ? 'i-lucide-monitor-x' : 'i-lucide-monitor'"
      aria-label="Toggle screen share"
      @click="emit('toggleScreen')"
    />
    <UButton
      variant="ghost"
      size="md"
      icon="i-lucide-settings-2"
      aria-label="Devices"
      @click="emit('openDevices')"
    />
    <span class="mx-1 h-6 w-px bg-default" />
    <UButton
      color="error"
      variant="solid"
      size="md"
      icon="i-lucide-phone-off"
      @click="emit('leave')"
    >
      Leave
    </UButton>
  </div>
</template>
