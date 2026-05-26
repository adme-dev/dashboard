<script setup lang="ts">
const props = defineProps<{
  stream: MediaStream
  label: string
  outputDeviceId?: string
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const hasVideo = computed(() =>
  props.stream.getVideoTracks().some(track => track.readyState === 'live')
)

type SinkSelectableMediaElement = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}

async function applyOutputDevice() {
  const el = videoEl.value as SinkSelectableMediaElement | null
  if (!el?.setSinkId || !props.outputDeviceId) return

  await el.setSinkId(props.outputDeviceId).catch(() => {})
}

watch([() => props.stream, videoEl], ([stream, el]) => {
  if (el) el.srcObject = stream
  void applyOutputDevice()
}, { immediate: true, flush: 'post' })

watch(() => props.outputDeviceId, () => {
  void applyOutputDevice()
})

onBeforeUnmount(() => {
  if (videoEl.value) videoEl.value.srcObject = null
})
</script>

<template>
  <div class="relative overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.08]">
    <video
      ref="videoEl"
      autoplay
      playsinline
      class="aspect-video w-full object-cover"
      :class="hasVideo ? '' : 'opacity-0'"
    />
    <div
      v-if="!hasVideo"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/[0.035] text-white/55"
    >
      <span class="flex size-9 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.08]">
        <UIcon name="i-lucide-volume-2" class="size-4" />
      </span>
      <span class="text-[11px] font-medium">Audio only</span>
    </div>
    <span class="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">
      {{ label }}
    </span>
  </div>
</template>
