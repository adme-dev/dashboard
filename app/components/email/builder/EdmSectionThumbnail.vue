<!-- app/components/email/builder/EdmSectionThumbnail.vue -->
<!-- Live-rendered mini preview of a section preset. Renders each preset block
     through the real EdmBlockRenderer at full email width (600px), then scales
     the canvas down to the target thumbnail width via CSS transform.
     SSR-safe: no browser APIs; scale is derived purely from the width prop.
     Non-interactive — the parent (palette flyout button) owns clicks. -->
<script setup lang="ts">
import { computed } from 'vue'
import EdmBlockRenderer from './EdmBlockRenderer.vue'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'

const EMAIL_WIDTH = 600

const props = withDefaults(defineProps<{
  preset: EdmSectionPreset
  /** Target rendered width of the thumbnail tile, in px. */
  width?: number
}>(), {
  width: 260
})

const scale = computed(() => props.width / EMAIL_WIDTH)

// The visible tile takes the target width; its height is the scaled-down
// height of whatever the inner canvas renders, capped by max-height clipping.
const tileStyle = computed(() => ({
  width: props.width + 'px'
}))

const innerStyle = computed(() => ({
  width: EMAIL_WIDTH + 'px',
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
  pointerEvents: 'none' as const
}))
</script>

<template>
  <div
    class="edm-section-thumbnail relative overflow-hidden rounded-md border border-default bg-white"
    :style="tileStyle"
  >
    <div :style="innerStyle">
      <EdmBlockRenderer
        v-for="(blockTpl, i) in preset.blocks"
        :key="i"
        :type="blockTpl.type"
        :props="blockTpl.data?.props || {}"
        :style="blockTpl.data?.style || {}"
      />
    </div>
  </div>
</template>

<style scoped>
.edm-section-thumbnail {
  /* Clip overly-tall sections so the tile chrome stays compact. */
  max-height: 220px;
}
</style>
