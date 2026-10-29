<!-- app/components/email/builder/EdmDocumentThumbnail.vue -->
<!-- Live-rendered mini preview of a saved EDM document. Non-interactive; parent
     components own clicks/actions. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import EdmBlockRenderer from './EdmBlockRenderer.vue'
import type { EdmFlyhubBlock, EdmFlyhubDocument } from '~~/app/types/edm'

const EMAIL_WIDTH = 600

interface ThumbnailBlockEntry {
  id: string
  block: EdmFlyhubBlock
}

const props = withDefaults(defineProps<{
  document: EdmFlyhubDocument | null | undefined
  width?: number
  maxHeight?: number
}>(), {
  width: 260,
  maxHeight: 360
})

const blocks = computed<ThumbnailBlockEntry[]>(() => {
  const document = props.document
  const childrenIds = document?.root?.data?.childrenIds ?? []
  return childrenIds
    .map(id => ({ id, block: document?.[id] }))
    .filter((entry): entry is ThumbnailBlockEntry => Boolean(entry.block))
})

const thumbnailRoot = ref<HTMLElement | null>(null)
const { width: measuredWidth } = useElementSize(thumbnailRoot, { width: props.width, height: 0 })
const scale = computed(() => (measuredWidth.value || props.width) / EMAIL_WIDTH)

const tileStyle = computed(() => ({
  width: '100%',
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
    ref="thumbnailRoot"
    inert
    aria-hidden="true"
    class="edm-document-thumbnail relative overflow-hidden rounded-md border border-default bg-white"
    :style="tileStyle"
  >
    <div :style="innerStyle">
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
