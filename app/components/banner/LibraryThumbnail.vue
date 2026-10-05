<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'

defineProps<{ thumbnailUrl?: string | null, canvasData?: Record<string, ArtboardState> }>()
const container = ref<HTMLElement | null>(null)
const visible = ref(false)
const { stop } = useIntersectionObserver(container, ([entry]) => {
  if (entry?.isIntersecting) {
    visible.value = true
    stop()
  }
}, { rootMargin: '100px' })
</script>

<template>
  <div ref="container" class="flex items-center justify-center overflow-hidden bg-elevated" aria-hidden="true">
    <img
      v-if="safeMediaUrl(thumbnailUrl)"
      :src="safeMediaUrl(thumbnailUrl)"
      alt=""
      loading="lazy"
      class="h-full w-full object-contain"
    >
    <BannerThumbnail v-else-if="visible && canvasData && Object.keys(canvasData).length" :canvas-data="canvasData" />
    <UIcon v-else name="i-lucide-image" class="size-6 text-muted" />
  </div>
</template>
