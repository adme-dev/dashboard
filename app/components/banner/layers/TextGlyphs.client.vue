<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { bannerTextRunStyle, bannerWordRuns } from '~~/shared/bannerWordPop'

defineProps<{ text: string, runs?: Layer['textRuns'], lineBoxFontSize?: number, fontSize?: number, wordPop?: Layer['wordPop'] | false }>()
</script>

<template>
  <template v-if="wordPop">
    <span
      v-for="(token, index) in bannerWordRuns(text, wordPop ? wordPop.unit : undefined, runs)"
      :key="index"
      :data-banner-word="token.wordIndex === null ? undefined : token.wordIndex"
      :style="token.wordIndex === null ? undefined : { display: 'inline-block', transformOrigin: 'center center' }"
    ><span v-for="(run, runIndex) in token.runs" :key="runIndex" :data-banner-run="run.sourceRunIndex" :style="bannerTextRunStyle(run)">{{ run.text }}</span></span>
  </template><template v-else-if="runs">
    <span v-for="(run, index) in runs" :key="index" :data-banner-run="index" :style="bannerTextRunStyle(run)">{{ run.text }}</span>
  </template><template v-else>
    {{ text }}
  </template><span v-if="lineBoxFontSize && lineBoxFontSize > (fontSize || 16)" aria-hidden="true" :style="{ fontSize: `${lineBoxFontSize}px` }">&#160;</span>
</template>
