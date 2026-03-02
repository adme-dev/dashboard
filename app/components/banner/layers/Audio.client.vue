<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
defineProps<{ layer: Layer; isActive: boolean }>()
</script>

<template>
  <div :style="{ opacity: 0, width: 0, height: 0, overflow: 'hidden', position: 'absolute' }">
    <audio
      v-if="layer.src"
      :src="layer.src"
      preload="auto"
      :loop="layer.loopAudio || false"
    />
  </div>
</template>
