<!-- app/components/email/builder/EdmTemplateThumbnail.vue -->
<!-- Live-rendered mini preview of a FULL starter template. Assembles the
     template's document via buildStarterTemplateDocument(), then renders every
     top-level block IN ORDER through the real EdmBlockRenderer at full email
     width (600px) and scales the canvas down to the target thumbnail width via
     CSS transform. SSR-safe: no browser APIs in setup; scale derives purely
     from the width prop, and the renderer is imported explicitly so the tile is
     testable via renderToString. Non-interactive — the parent owns clicks. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EdmBlockRenderer from './EdmBlockRenderer.vue'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
import type { EdmFlyhubBlock } from '~~/app/types/edm'

const EMAIL_WIDTH = 600

interface ThumbnailBlockEntry {
  id: string
  block: EdmFlyhubBlock
}

const props = withDefaults(defineProps<{
  /** Starter template id (see EDM_STARTER_TEMPLATES). */
  templateId: string
  /** Optional owned image preview URL. Falls back to live render on load error. */
  previewImageUrl?: string | null
  /** Target rendered width of the thumbnail tile, in px. */
  width?: number
  /** Max visible height of the clipped tile, in px. */
  maxHeight?: number
}>(), {
  width: 260,
  maxHeight: 360
})

const imageFailed = ref(false)
watch(() => props.previewImageUrl, () => {
  imageFailed.value = false
})

// Build once per template id. buildStarterTemplateDocument is pure + SSR-safe.
const blocks = computed<ThumbnailBlockEntry[]>(() => {
  const document = buildStarterTemplateDocument(props.templateId)
  const childrenIds = document.root?.data?.childrenIds ?? []
  return childrenIds
    .map(id => ({ id, block: document[id] }))
    .filter((entry): entry is ThumbnailBlockEntry => Boolean(entry.block))
})

const scale = computed(() => props.width / EMAIL_WIDTH)

const useImagePreview = computed(() => Boolean(props.previewImageUrl && !imageFailed.value))

const tileStyle = computed(() => ({
  width: props.width + 'px',
  height: useImagePreview.value ? props.maxHeight + 'px' : undefined,
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
    <img
      v-if="useImagePreview"
      class="email-starter-preview-image block h-full w-full object-cover object-top"
      :src="previewImageUrl || ''"
      alt=""
      loading="lazy"
      @error="imageFailed = true"
    >
    <div v-else :style="innerStyle">
      <EdmBlockRenderer
        v-for="entry in blocks"
        :key="entry.id"
        :type="entry.block.type"
        :props="entry.block.data?.props || {}"
        :style="entry.block.data?.style || {}"
      />
    </div>
  </div>
</template>
