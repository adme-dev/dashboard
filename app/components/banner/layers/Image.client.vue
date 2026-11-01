<script setup lang="ts">
import { IMAGE_ENTRANCE_CSS, imageEntranceStyle } from '~~/shared/bannerImageEntrance.mjs'
import { effectStyleFromLayer } from '~~/shared/bannerEffects'
import { bannerImageCropCss } from '~~/shared/bannerImageCrop'
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const effects = computed(() => effectStyleFromLayer(props.layer as unknown as Record<string, unknown>))
const displaySrc = computed(() => getFeedOverride(props.layer.id, 'src') ?? props.layer.src)
</script>

<template>
  <div
    class="relative w-full h-full"
    :class="layer.imageEntrance ? 'overflow-visible' : 'overflow-hidden'"
    :style="{ opacity: layer.keyframes?.opacity?.length ? 1 : layer.opacity, filter: effects.visualFilter }"
  >
    <template v-if="layer.imageEntrance && displaySrc">
      <component :is="'style'">
        {{ IMAGE_ENTRANCE_CSS }}
      </component>
      <div data-image-entrance :style="imageEntranceStyle(layer.imageEntrance)">
        <img
          v-if="layer.imageEntrance.kind === 'softWipe'"
          :src="displaySrc"
          :alt="layer.name"
          class="w-full h-full pointer-events-none"
          :style="{ objectFit: layer.fit || 'cover', display: 'block' }"
          draggable="false"
        >
        <div v-else class="xf-slam-content">
          <img
            v-for="side in ['top', 'bottom']"
            :key="side"
            :class="`xf-slam-${side}`"
            :src="displaySrc"
            :alt="layer.name"
            draggable="false"
          >
        </div>
      </div>
    </template>
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
</template>
