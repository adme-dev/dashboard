<script setup lang="ts">
import type { BannerAsset } from '~/types/banner-studio'
import { bannerImageCropCss, type BannerImageCrop } from '~~/shared/bannerImageCrop'

const { state, selectedLayer, updateLayer, activeFormat } = useBannerStudio()
const { pauseTimeline } = useBannerTimeline()
const realtime = useBannerRealtime()
const toast = useToast()
const replaceOpen = ref(false)
const cropOpen = ref(false)
const disabled = computed(() => !selectedLayer.value || selectedLayer.value.locked || realtime.isLayerLockedByOther(selectedLayer.value.id))
const identity = computed(() => JSON.stringify([state.project?.id, state.activeKey, selectedLayer.value?.id, selectedLayer.value?.src, selectedLayer.value?.w, selectedLayer.value?.h, selectedLayer.value?.imageCrop, state.layoutView]))
let editingIdentity = ''
watch(identity, () => {
  replaceOpen.value = false
  cropOpen.value = false
})

function begin(kind: 'replace' | 'crop') {
  if (disabled.value) return
  pauseTimeline()
  editingIdentity = identity.value
  if (kind === 'replace') replaceOpen.value = true
  else cropOpen.value = true
}
function current() {
  if (!disabled.value && editingIdentity === identity.value) return true
  toast.add({ title: 'Image changed', description: 'Select the image and try again.', color: 'warning' })
  return false
}
function replace(asset: BannerAsset) {
  if (!current() || !asset.mimeType.startsWith('image/')) return
  updateLayer(selectedLayer.value!.id, { src: asset.url, imageCrop: undefined, fit: 'contain' })
  replaceOpen.value = false
  toast.add({ title: 'Image replaced', description: asset.name, color: 'success' })
}
function applyCrop(crop: BannerImageCrop) {
  if (current() && bannerImageCropCss(crop)) updateLayer(selectedLayer.value!.id, { imageCrop: crop })
}
function setFit(fit: 'cover' | 'contain' | 'fill') {
  if (!disabled.value) updateLayer(selectedLayer.value!.id, { fit, imageCrop: undefined })
}
function fillCanvas() {
  if (disabled.value || !activeFormat.value) return
  updateLayer(selectedLayer.value!.id, { x: 0, y: 0, w: activeFormat.value.w, h: activeFormat.value.h, zIndex: 1, fit: 'cover', imageCrop: undefined })
}
</script>

<template>
  <section v-if="selectedLayer" aria-label="Image properties" class="space-y-3">
    <h3 class="text-xs font-semibold">
      Image
    </h3>
    <div class="relative h-28 overflow-hidden rounded-md border border-default bg-elevated">
      <img
        v-if="selectedLayer.src"
        :src="safeMediaUrl(selectedLayer.src)"
        :alt="selectedLayer.name"
        class="size-full object-contain"
      >
    </div>
    <UButton
      label="Replace image"
      icon="i-lucide-image-plus"
      variant="outline"
      color="neutral"
      size="sm"
      class="w-full justify-center"
      :disabled="disabled"
      @click="begin('replace')"
    />
    <UButton
      label="Crop & fill"
      icon="i-lucide-crop"
      variant="soft"
      color="neutral"
      size="sm"
      class="w-full justify-center"
      :disabled="disabled || !selectedLayer.src"
      @click="begin('crop')"
    />
    <UFormField label="Image fit" :help="selectedLayer.imageCrop ? 'A custom crop is applied. Choose a fit to reset it.' : undefined">
      <USelect
        :model-value="selectedLayer.fit ?? 'cover'"
        :items="[{ label: 'Fill frame', value: 'cover' }, { label: 'Show full image', value: 'contain' }, { label: 'Stretch', value: 'fill' }]"
        class="w-full"
        size="sm"
        :disabled="disabled"
        @update:model-value="setFit"
      />
    </UFormField>
    <UFormField label="Corner radius">
      <UInput
        type="number"
        :min="0"
        :model-value="selectedLayer.borderRadius ?? 0"
        class="w-full"
        size="sm"
        :disabled="disabled"
        @update:model-value="value => updateLayer(selectedLayer!.id, { borderRadius: Math.max(0, Number(value) || 0) })"
      />
    </UFormField>
    <UButton
      label="Fill canvas"
      icon="i-lucide-maximize"
      variant="ghost"
      color="neutral"
      size="sm"
      class="w-full justify-center"
      :disabled="disabled"
      @click="fillCanvas"
    />
    <UModal
      v-model:open="replaceOpen"
      title="Replace image"
      description="Choose an image from your media library or upload a new file. Replacement follows the current layout editing scope."
      :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[70vh] overflow-y-auto' }"
    >
      <template #body>
        <BannerAssetsPanel media-type="image" selection-only @select="replace" />
      </template>
    </UModal>
    <BannerImageCropModal v-model:open="cropOpen" :layer="selectedLayer" @apply="applyCrop" />
  </section>
</template>
