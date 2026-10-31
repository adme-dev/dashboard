<script setup lang="ts">
import type { BannerMediaType } from '~/utils/banner-media'

const { insertElement } = useBannerInsert()
const view = ref<BannerMediaType | 'home' | 'elements'>('home')
const assetsPanel = ref<{ openUpload: () => void, openMotorStack: () => void }>()
const categories = [
  { label: 'Images', icon: 'i-lucide-image', value: 'image' },
  { label: 'Videos', icon: 'i-lucide-video', value: 'video' },
  { label: 'Audio tracks', icon: 'i-lucide-music', value: 'audio' }
] as const

async function upload() {
  view.value = 'all'
  await nextTick()
  assetsPanel.value?.openUpload()
}
async function motorstack() {
  view.value = 'image'
  await nextTick()
  assetsPanel.value?.openMotorStack()
}
</script>

<template>
  <section aria-label="Insert panel" class="min-w-0">
    <div class="flex items-center gap-2 p-3 border-b border-default">
      <UButton
        v-if="view !== 'home'"
        icon="i-lucide-arrow-left"
        aria-label="Back to insert"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="() => { view = 'home' }"
      />
      <h2 class="text-sm font-semibold">
        {{ view === 'home' ? 'Insert' : view === 'elements' ? 'Shapes & elements' : view === 'all' ? 'Media library' : categories.find(item => item.value === view)?.label }}
      </h2>
    </div>
    <div v-if="view === 'home'" class="p-3 space-y-4">
      <UButton
        label="Upload media"
        icon="i-lucide-upload"
        color="neutral"
        variant="outline"
        class="w-full justify-center py-5"
        @click="upload"
      />
      <div class="grid grid-cols-3 gap-1.5">
        <UButton
          v-for="item in [{ label: 'Text', type: 'text', icon: 'i-lucide-type' }, { label: 'Shape', type: 'rect', icon: 'i-lucide-shapes' }, { label: 'Button', type: 'button', icon: 'i-lucide-mouse-pointer-click' }]"
          :key="item.type"
          variant="soft"
          color="neutral"
          class="flex-col justify-center gap-1 py-3 text-xs"
          @click="insertElement(item.type)"
        >
          <UIcon :name="item.icon" class="size-5" />{{ item.label }}
        </UButton>
      </div>
      <div class="space-y-1">
        <UButton
          v-for="item in categories"
          :key="item.value"
          :label="item.label"
          :icon="item.icon"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="() => { view = item.value }"
        />
        <UButton
          label="MotorStack media"
          icon="i-lucide-car"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="motorstack"
        />
        <UButton
          label="Shapes & elements"
          icon="i-lucide-shapes"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="() => { view = 'elements' }"
        />
        <UButton
          label="Mask"
          icon="i-lucide-scan"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="insertElement('mask')"
        />
      </div>
      <p class="text-xs text-muted leading-relaxed">
        Choose media to add it to the current slide. Use the image properties to replace or crop it.
      </p>
    </div>
    <BannerElementsPanel v-else-if="view === 'elements'" />
    <BannerAssetsPanel
      v-else
      ref="assetsPanel"
      :key="view"
      :media-type="view"
    />
  </section>
</template>
