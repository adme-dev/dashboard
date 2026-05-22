<script setup lang="ts">
const props = defineProps<{
  videoTrack: MediaStreamTrack | null
  name: string
  isLocal?: boolean
  micMuted?: boolean
  speaking?: boolean
}>()

const videoEl = ref<HTMLVideoElement | null>(null)

watchEffect(() => {
  if (!videoEl.value) return
  videoEl.value.srcObject = props.videoTrack
    ? new MediaStream([props.videoTrack])
    : null
})

const hasVideo = computed(() =>
  !!props.videoTrack && props.videoTrack.enabled && !props.videoTrack.muted
)
</script>

<template>
  <div
    class="relative aspect-video overflow-hidden rounded-xl ring-1 ring-default
           bg-zinc-900 dark:bg-black transition-shadow"
    :class="speaking ? 'shadow-[0_0_0_3px_theme(colors.emerald.400)]' : ''"
  >
    <video
      v-show="hasVideo"
      ref="videoEl"
      autoplay
      playsinline
      :muted="isLocal"
      class="w-full h-full object-cover"
    />
    <div
      v-if="!hasVideo"
      class="absolute inset-0 flex items-center justify-center"
    >
      <UIcon name="i-lucide-video-off" class="size-10 text-zinc-500" />
    </div>
    <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between">
      <span class="text-xs font-medium text-white bg-black/60 backdrop-blur-sm rounded px-2 py-0.5">
        {{ name }}{{ isLocal ? ' (you)' : '' }}
      </span>
      <UIcon
        v-if="micMuted"
        name="i-lucide-mic-off"
        class="size-4 text-red-400 bg-black/60 rounded p-0.5"
      />
    </div>
  </div>
</template>
