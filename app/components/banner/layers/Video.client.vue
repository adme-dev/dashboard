<script setup lang="ts">
import { mediaMaskCss } from '~~/shared/bannerImportedMotion'
import type { Layer } from '~/types/banner-studio'
import { effectStyleFromLayer } from '~~/shared/bannerEffects'
import { bannerImageCropCss } from '~~/shared/bannerImageCrop'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()
const effects = computed(() => effectStyleFromLayer(props.layer as unknown as Record<string, unknown>))
const cropStyle = computed(() => bannerImageCropCss(props.layer.videoCrop))
</script>

<template>
  <div
    class="absolute inset-0 overflow-hidden"
    :style="[mediaMaskCss(layer.mediaMask), { filter: effects.visualFilter }]"
  >
    <video
      v-if="layer.src"
      :src="layer.src"
      muted
      playsinline
      preload="auto"
      class="w-full h-full pointer-events-none"
      :style="[cropStyle, {
        objectFit: cropStyle ? 'cover' : (layer.fit || 'cover'),
        objectPosition: cropStyle ? '50% 50%' : `${layer.focalX ?? 50}% ${layer.focalY ?? 50}%`
      }]"
    />
    <div
      v-else
      class="w-full h-full flex items-center justify-center bg-white/5 text-white/30 text-xs"
    >
      No video
    </div>
  </div>
</template>
