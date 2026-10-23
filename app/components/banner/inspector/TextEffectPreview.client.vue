<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import type { Layer } from '~/types/banner-studio'
import TextLayer from '../layers/Text.client.vue'

const props = defineProps<{ layer: Layer }>()
const host = ref<HTMLElement | null>(null)
const { width } = useElementSize(host)
const padding = 40
const scale = computed(() => Math.min(1, (width.value || 240) / (Math.max(1, props.layer.w) + padding * 2)))
const contentHeight = computed(() => Math.max(props.layer.h, (props.layer.fontSize || 16) * (props.layer.lineHeight || 1.2) * (props.layer.text?.split('\n').length || 1)))
const height = computed(() => Math.max(96, (contentHeight.value + padding * 2) * scale.value))
</script>

<template>
  <div
    ref="host"
    aria-label="Text effect on a transparent background"
    class="relative w-full overflow-hidden rounded border border-white/10"
    :style="{ height: `${height}px`, backgroundImage: 'repeating-conic-gradient(#252529 0 25%, #19191d 0 50%)', backgroundSize: '16px 16px' }"
  >
    <div class="absolute" :style="{ left: `${padding * scale}px`, top: `${(height - contentHeight * scale) / 2}px`, width: `${layer.w}px`, height: `${contentHeight}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }">
      <TextLayer :layer="layer" :is-active="false" />
    </div>
  </div>
</template>
