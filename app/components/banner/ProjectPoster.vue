<script setup lang="ts">
import { computed, watch } from 'vue'
import { queueBannerPoster } from '~/utils/banner-poster-queue'
import { bannerPosterUrl } from '~/utils/banner-poster-preload'
import { safeMediaUrl } from '~/utils/safe-url'

const props = defineProps<{ projectId: string, hasLayouts?: boolean, version?: string, size?: 'list' | 'gallery', thumbnailUrl?: string | null }>()
const container = ref<HTMLElement | null>(null)
const src = ref<string>()
const fallback = computed(() => safeMediaUrl(props.thumbnailUrl))
const visible = ref(false)
const nativeFailed = ref(false)
let failedFallback: string | undefined
let release: (() => void) | undefined
let finished = false
const poster = computed(() => props.hasLayouts && !nativeFailed.value
  ? bannerPosterUrl(props.projectId, props.size || 'gallery', props.version)
  : fallback.value)

useIntersectionObserver(container, ([entry]) => {
  visible.value = !!entry?.isIntersecting
}, { rootMargin: '100px' })

watch([visible, poster], ([nearby, url]) => {
  if (!nearby || !url) {
    if (!src.value) {
      release?.()
      release = undefined
    }
    return
  }
  if (!release && !finished && url !== failedFallback) {
    release = queueBannerPoster(() => { src.value = poster.value })
  }
}, { flush: 'sync' })

function finish() {
  finished = true
  release?.()
  release = undefined
}
function onError() {
  if (src.value === fallback.value) failedFallback = src.value
  src.value = undefined
  release?.()
  release = undefined
  nativeFailed.value = true
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
