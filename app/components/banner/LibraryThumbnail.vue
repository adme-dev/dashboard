<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'
import { hasBannerPreview } from '~/utils/banner-library'

const props = defineProps<{ thumbnailUrl?: string | null, canvasData?: Record<string, ArtboardState> }>()
const hasCanvas = computed(() => hasBannerPreview(props.canvasData))
const imageFailed = ref(false)
watch(() => props.thumbnailUrl, () => { imageFailed.value = false })
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
    <BannerThumbnail v-if="visible && hasCanvas" :canvas-data="canvasData!" />
    <img
      v-else-if="!hasCanvas && !imageFailed && safeMediaUrl(thumbnailUrl)"
      :src="safeMediaUrl(thumbnailUrl)"
      alt=""
      loading="lazy"
      @error="imageFailed = true"
      class="h-full w-full object-contain"
    >
    <UIcon v-else name="i-lucide-image" class="size-6 text-muted" />
  </div>
</template>
