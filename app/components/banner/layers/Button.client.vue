<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const displayText = computed(() => getFeedOverride(props.layer.id, 'text') ?? props.layer.text ?? 'Button')
const displayBgColor = computed(() => getFeedOverride(props.layer.id, 'bgColor') ?? props.layer.bgColor ?? '#e8c84a')
const displayTextColor = computed(() => getFeedOverride(props.layer.id, 'color') ?? props.layer.textColor ?? '#000')
</script>

<template>
  <div
    class="w-full h-full flex items-center justify-center pointer-events-none"
    :style="{
      backgroundColor: displayBgColor,
      borderRadius: `${layer.borderRadius ?? 2}px`,
      opacity: layer.opacity,
      border: layer.bgColor === 'transparent' ? '1px solid rgba(255,255,255,0.3)' : 'none',
    }"
  >
    <span
      :style="{
        fontSize: `${layer.fontSize || 12}px`,
        fontWeight: layer.fontWeight || 800,
        fontFamily: layer.fontFamily || 'Barlow Condensed',
        color: displayTextColor,
        fontStyle: layer.fontStyle || 'normal',
        textShadow: layer.textShadow || 'none',
        WebkitTextStroke: layer.textStroke || 'unset',
        textTransform: (layer.textTransform as any) || 'uppercase',
        letterSpacing: layer.letterSpacing || '0.1em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }"
    >{{ displayText }}</span>
  </div>
</template>
