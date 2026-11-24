<script setup lang="ts">
import { isBannerImageBackground } from '~~/shared/bannerImageBackground.mjs'
import { effectStyleFromLayer } from '~~/shared/bannerEffects'
import { bannerImageCropCss } from '~~/shared/bannerImageCrop'
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const effects = computed(() => effectStyleFromLayer(props.layer as unknown as Record<string, unknown>))
const outerEffects = computed(() => effectStyleFromLayer({ visualFilter: props.layer.imageOuterFilter }))
const displaySrc = computed(() => getFeedOverride(props.layer.id, 'src') ?? props.layer.src)
</script>

<template>
  <div class="relative w-full h-full" :style="{ filter: outerEffects.visualFilter || effects.visualFilter, overflow: layer.imageOuterFilter ? undefined : 'hidden', borderRadius: !layer.imageOuterFilter && layer.borderRadius ? `${layer.borderRadius}px` : undefined }">
    <div
      class="relative w-full h-full"
      :style="{ filter: layer.imageOuterFilter ? effects.visualFilter : undefined, overflow: layer.imageOuterFilter ? 'hidden' : undefined, borderRadius: layer.imageOuterFilter && layer.borderRadius ? `${layer.borderRadius}px` : undefined }"
    >
      <div
        v-if="displaySrc && isBannerImageBackground(layer.imageBackground)"
        class="w-full h-full pointer-events-none"
        role="img"
        :aria-label="layer.name"
        :style="{ backgroundImage: `url(${JSON.stringify(displaySrc)})`, backgroundSize: layer.imageBackground!.size, backgroundPosition: layer.imageBackground!.position, backgroundRepeat: layer.imageBackground!.repeat }"
      />
      <img
        v-else-if="displaySrc"
        :src="displaySrc"
        :alt="layer.name"
        class="w-full h-full pointer-events-none"
        :style="bannerImageCropCss(layer.imageCrop) || { objectFit: layer.fit || 'cover' }"
        draggable="false"
      >
      <div
        v-else
        class="w-full h-full flex items-center justify-center bg-white/5 text-white/30 text-xs"
      >
        No image
      </div>
    </div>
  </div>
</template>
