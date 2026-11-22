<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { REVEAL_WRAPPER_STYLE, REVEAL_GLOW_STYLE, revealContentStyle } from '~~/shared/bannerImportedMotion'

defineProps<{ layer: Layer }>()
</script>

<template>
  <div v-if="layer.reveal" data-banner-reveal :style="REVEAL_WRAPPER_STYLE">
    <div data-banner-reveal-content :style="layer.reveal.type === 'softWipe' ? 'width:100%;height:100%;mask-image:linear-gradient(90deg,black 0%,black 50%,transparent 74%);-webkit-mask-image:linear-gradient(90deg,black 0%,black 50%,transparent 74%);mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-size:200% 100%;-webkit-mask-size:200% 100%;' : revealContentStyle(layer.reveal.type)">
      <slot />
    </div>
    <div v-if="layer.reveal.type === 'tvExpand'" data-banner-reveal-glow :style="REVEAL_GLOW_STYLE" />
  </div>
  <slot v-else />
</template>
