<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const displayFillColor = computed(() => getFeedOverride(props.layer.id, 'fillColor') ?? props.layer.fillColor ?? 'rgba(255,255,255,0.1)')
</script>

<template>
  <div
    class="w-full h-full pointer-events-none"
    :style="{
      backgroundColor: displayFillColor,
      borderRadius: `${layer.borderRadius ?? 0}px`,
      opacity: layer.opacity,
    }"
  />
</template>
