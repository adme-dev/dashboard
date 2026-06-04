<!-- app/components/email/builder/EdmTemplateThumbnail.vue -->
<!-- Live-rendered mini preview of a FULL starter template. Assembles the
     template's document via buildStarterTemplateDocument(), then renders every
     top-level block IN ORDER through the real EdmBlockRenderer at full email
     width (600px) and scales the canvas down to the target thumbnail width via
     CSS transform. SSR-safe: no browser APIs in setup; scale derives purely
     from the width prop, and the renderer is imported explicitly so the tile is
     testable via renderToString. Non-interactive — the parent owns clicks. -->
<script setup lang="ts">
import { computed } from 'vue'
import EdmBlockRenderer from './EdmBlockRenderer.vue'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
import type { EdmFlyhubBlock } from '~~/app/types/edm'

const EMAIL_WIDTH = 600

const props = withDefaults(defineProps<{
  /** Starter template id (see EDM_STARTER_TEMPLATES). */
  templateId: string
  /** Target rendered width of the thumbnail tile, in px. */
  width?: number
  /** Max visible height of the clipped tile, in px. */
  maxHeight?: number
}>(), {
  width: 260,
  maxHeight: 360
})

// Build once per template id. buildStarterTemplateDocument is pure + SSR-safe.
const blocks = computed<EdmFlyhubBlock[]>(() => {
  const document = buildStarterTemplateDocument(props.templateId)
  const childrenIds = document.root?.data?.childrenIds ?? []
  return childrenIds
    .map(id => document[id])
    .filter((block): block is EdmFlyhubBlock => Boolean(block))
})

const scale = computed(() => props.width / EMAIL_WIDTH)

const tileStyle = computed(() => ({
  width: props.width + 'px',
  maxHeight: props.maxHeight + 'px'
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
    class="edm-template-thumbnail relative overflow-hidden rounded-md border border-default bg-white"
    :style="tileStyle"
  >
    <div :style="innerStyle">
      <EdmBlockRenderer
        v-for="(block, i) in blocks"
        :key="i"
        :type="block.type"
        :props="block.data?.props || {}"
        :style="block.data?.style || {}"
      />
    </div>
  </div>
</template>
