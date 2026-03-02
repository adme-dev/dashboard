<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const displaySrc = computed(() => getFeedOverride(props.layer.id, 'src') ?? props.layer.src)
</script>

<template>
  <div
    class="absolute inset-0"
    :style="{
      backgroundColor: layer.bgColor || '#0a0a10',
      opacity: layer.opacity,
      pointerEvents: 'none',
    }"
  >
    <video
      v-if="layer.srcType === 'video' && displaySrc"
      :src="displaySrc"
      muted
      playsinline
      preload="auto"
      :style="{
        width: '100%',
        height: '100%',
        objectFit: layer.fit || 'cover',
        objectPosition: `${layer.focalX ?? 50}% ${layer.focalY ?? 50}%`,
        display: 'block',
      }"
    />
    <img
      v-else-if="displaySrc"
      :src="displaySrc"
      :style="{
        width: '100%',
        height: '100%',
        objectFit: layer.fit || 'cover',
        objectPosition: `${layer.focalX ?? 50}% ${layer.focalY ?? 50}%`,
        display: 'block',
      }"
    />
  </div>
</template>
