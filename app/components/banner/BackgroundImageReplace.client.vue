<script setup lang="ts">
import type { BannerAsset, Layer } from '~/types/banner-studio'

const props = defineProps<{ layer: Layer }>()
const { state, replaceBackgroundImage } = useBannerStudio()
const { pauseTimeline } = useBannerTimeline()
const toast = useToast()
const open = ref(false)
const allLayouts = ref(true)
watch(() => [state.project?.id, state.activeKey, props.layer.id, props.layer.src], () => { open.value = false })

function choose() {
  pauseTimeline()
  allLayouts.value = state.setKeys.length > 1
  open.value = true
}

function apply(asset: BannerAsset) {
  if (!open.value || !asset.mimeType.startsWith('image/')) return
  try {
    const count = replaceBackgroundImage(props.layer.id, asset.url, allLayouts.value)
    open.value = false
    toast.add({ title: 'Background image replaced', description: `${props.layer.name} · ${count} ${count === 1 ? 'layout' : 'layouts'}`, color: 'success' })
  } catch (error) {
    toast.add({ title: 'Could not replace background', description: error instanceof Error ? error.message : 'Try again.', color: 'error' })
  }
}
</script>

<template>
  <UButton label="Replace background image" icon="i-lucide-image-plus" size="sm" variant="outline" @click="choose" />
  <UModal v-model:open="open" title="Replace background image" :description="layer.name" :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[70vh] overflow-y-auto' }">
    <template #body>
      <UCheckbox v-if="state.setKeys.length > 1" v-model="allLayouts" label="Replace across all layouts" class="mb-3" />
      <BannerAssetsPanel media-type="image" selection-only @select="apply" />
    </template>
  </UModal>
</template>
