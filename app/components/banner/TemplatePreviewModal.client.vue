<script setup lang="ts">
import type { ArtboardState } from '~/types/banner-studio'
import { copyTemplateCanvas } from '~/utils/banner-template-start'

const props = defineProps<{ name: string, canvasData: Record<string, ArtboardState> | string, clientId?: string | null }>()
defineEmits<{ close: [] }>()
const { fetchCustomFonts, getExportCustomFonts } = useBannerFonts(() => props.clientId)
const canvas = computed(() => {
  try { return copyTemplateCanvas(props.canvasData) }
  catch { return null }
})
const fonts = computed(() => getExportCustomFonts(Object.values(canvas.value || {}).flatMap(board => board.layers)))
onMounted(() => { void fetchCustomFonts() })
</script>

<template>
  <UModal :open="true" :title="name" description="Template preview" :ui="{ content: 'sm:max-w-5xl', body: 'flex min-h-0 flex-col p-0 sm:p-0' }" @update:open="!$event && $emit('close')">
    <template #body>
      <div v-if="canvas" class="flex h-[65dvh] min-h-0 flex-col">
        <BannerSavedPreview :canvas="canvas" :fonts="fonts" :project-name="name" />
      </div>
      <UAlert v-else title="This template has no supported layouts to preview." color="warning" class="m-4" />
    </template>
  </UModal>
</template>
