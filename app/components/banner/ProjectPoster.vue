<script setup lang="ts">
import { queueBannerPoster } from '~/utils/banner-poster-queue'
import { safeMediaUrl } from '~/utils/safe-url'

const props = defineProps<{ projectId: string, hasLayouts?: boolean, version?: string, thumbnailUrl?: string | null }>()
const container = ref<HTMLElement | null>(null)
const src = ref<string>()
const fallback = safeMediaUrl(props.thumbnailUrl)
let release: (() => void) | undefined
let finished = false
const poster = props.hasLayouts
  ? `/api/agency/banner-studio/projects/${encodeURIComponent(props.projectId)}/image?${new URLSearchParams({ size: 'gallery', v: props.version || '' })}`
  : fallback

useIntersectionObserver(container, ([entry]) => {
  if (!entry?.isIntersecting) {
    if (!src.value) {
      release?.()
      release = undefined
    }
  } else if (poster && !release && !finished) {
    release = queueBannerPoster(() => {
      src.value = poster
    })
  }
}, { rootMargin: '100px' })

function finish() {
  finished = true
  release?.()
  release = undefined
}
function onError() {
  if (fallback && src.value !== fallback) {
    src.value = fallback
    return
  }
  src.value = undefined
  finish()
}
onBeforeUnmount(() => release?.())
</script>

<template>
  <div ref="container" class="flex items-center justify-center overflow-hidden bg-elevated" aria-hidden="true">
    <img
      v-if="src"
      :src="src"
      alt=""
      decoding="async"
      class="h-full w-full object-contain"
      @load="finish"
      @error="onError"
    >
    <UIcon v-else name="i-lucide-image" class="size-6 text-muted" />
  </div>
</template>
