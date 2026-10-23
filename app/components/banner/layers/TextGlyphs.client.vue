<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

defineProps<{ text: string, runs?: Layer['textRuns'], lineBoxFontSize?: number, fontSize?: number }>()
</script>

<template>
  <template v-if="runs">
    <span v-for="(run, index) in runs" :key="index" :style="{ fontSize: run.fontSize ? `${run.fontSize}px` : undefined, position: run.top !== undefined ? 'relative' : undefined, top: run.top !== undefined ? `${run.top}px` : undefined }">{{ run.text }}</span>
  </template><template v-else>
    {{ text }}
  </template><span v-if="lineBoxFontSize && lineBoxFontSize > (fontSize || 16)" aria-hidden="true" :style="{ fontSize: `${lineBoxFontSize}px` }">&#160;</span>
</template>
