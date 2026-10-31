<script setup lang="ts">
import { effectStyleFromLayer } from '~~/shared/bannerEffects'
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const displayFillColor = computed(() => getFeedOverride(props.layer.id, 'fillColor') ?? props.layer.fillColor ?? 'rgba(255,255,255,0.1)')
const effects = computed(() => effectStyleFromLayer(props.layer as unknown as Record<string, unknown>))
</script>

<template>
  <div
    class="w-full h-full pointer-events-none"
    :style="{
      background: displayFillColor,
      borderRadius: layer.rectShape === 'ellipse' ? '50%' : `${layer.borderRadius ?? 0}px`,
      filter: effects.visualFilter,
      opacity: layer.opacity
    }"
  />
</template>
