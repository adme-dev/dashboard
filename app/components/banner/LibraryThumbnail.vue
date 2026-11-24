<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'
import { hasBannerPreview } from '~/utils/banner-library'

const props = defineProps<{ clientId?: string | null, thumbnailUrl?: string | null, canvasData?: Record<string, ArtboardState> }>()
const hasCanvas = computed(() => hasBannerPreview(props.canvasData))
const imageFailed = ref(false)
watch(() => props.thumbnailUrl, () => {
  imageFailed.value = false
})
const container = ref<HTMLElement | null>(null)
const visible = ref(false)
useIntersectionObserver(container, ([entry]) => {
  visible.value = entry?.isIntersecting === true
}, { rootMargin: '100px' })
</script>

<template>
  <div ref="container" class="flex items-center justify-center overflow-hidden bg-elevated" aria-hidden="true">
    <LazyBannerThumbnail v-if="visible && hasCanvas" :canvas-data="canvasData!" :client-id="clientId" />
    <img
      v-else-if="!hasCanvas && !imageFailed && safeMediaUrl(thumbnailUrl)"
      :src="safeMediaUrl(thumbnailUrl)"
      alt=""
      loading="lazy"
      class="h-full w-full object-contain"
      @error="imageFailed = true"
    >
    <UIcon v-else name="i-lucide-image" class="size-6 text-muted" />
  </div>
</template>
