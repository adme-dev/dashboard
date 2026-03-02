<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { getFeedOverride } = useBannerFeeds()
const displaySrc = computed(() => getFeedOverride(props.layer.id, 'src') ?? props.layer.src)
</script>

<template>
  <div
    class="w-full h-full overflow-hidden"
    :style="{ opacity: layer.opacity }"
  >
    <img
      v-if="displaySrc"
      :src="displaySrc"
      :alt="layer.name"
      class="w-full h-full pointer-events-none"
      :style="{ objectFit: layer.fit || 'cover' }"
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
