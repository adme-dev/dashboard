<script setup lang="ts">
import type { BannerVideoClock } from '~~/shared/bannerVideoClock'
import { videoFrames } from '~/utils/banner-video-frames'
import { safeMediaUrl } from '~/utils/safe-url'

const props = defineProps<{
  src: string
  clock: BannerVideoClock
  span: number
}>()
const host = ref<HTMLElement>()
const visible = ref(false)
const frames = ref<string[]>([])
const failed = ref(false)
let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    visible.value = entries.some(entry => entry.isIntersecting)
  })
  if (host.value) observer.observe(host.value)
})
onUnmounted(() => observer?.disconnect())
watch(
  () => [
    visible.value,
    props.src,
    props.clock.mediaStart,
    props.clock.mediaEnd,
    props.clock.mediaLoop,
    props.span
  ],
  async (_, __, cleanup) => {
    const controller = new AbortController()
    cleanup(() => controller.abort())
    if (!visible.value) return
    frames.value = []
    failed.value = false
    const src = safeMediaUrl(props.src)
    if (!src) {
      failed.value = true
      return
    }
    try {
      const result = await videoFrames(
        src,
        props.clock,
        props.span,
        controller.signal
      )
      if (!controller.signal.aborted) {
        frames.value = result
        failed.value = !result.length
      }
    } catch {
      if (!controller.signal.aborted) failed.value = true
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    ref="host"
    aria-hidden="true"
    class="flex size-full overflow-hidden rounded-md bg-elevated"
  >
    <img
      v-for="(frame, index) in frames"
      :key="index"
      :src="frame"
      alt=""
      draggable="false"
      class="h-full min-w-0 flex-1 object-cover"
    >
    <div
      v-if="!frames.length"
      class="flex size-full items-center justify-center gap-1 text-xs text-muted"
    >
      <UIcon name="i-lucide-film" class="size-3 shrink-0" />
      <span>{{ failed ? "Video" : "Loading frames…" }}</span>
    </div>
  </div>
</template>
