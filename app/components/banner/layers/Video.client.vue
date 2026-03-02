<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

defineProps<{
  layer: Layer
  isActive: boolean
}>()
</script>

<template>
  <div
    class="absolute overflow-hidden"
    :style="{ opacity: layer.opacity }"
  >
    <video
      v-if="layer.src"
      :src="layer.src"
      muted
      playsinline
      preload="auto"
      class="w-full h-full pointer-events-none"
      :style="{
        objectFit: layer.fit || 'cover',
        objectPosition: `${layer.focalX ?? 50}% ${layer.focalY ?? 50}%`,
      }"
    />
    <div
      v-else
      class="w-full h-full flex items-center justify-center bg-white/5 text-white/30 text-xs"
    >
      No video
    </div>
  </div>
</template>
