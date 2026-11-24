<script setup lang="ts">
import { shallowRef, onBeforeUnmount } from 'vue'
import type { ArtboardState, BannerProject } from '~/types/banner-studio'
import { hasBannerPreview } from '~/utils/banner-library'

const props = defineProps<{ projectId?: string, previewKey?: string, previewVersion?: string, clientId?: string | null, thumbnailUrl?: string | null, canvasData?: Record<string, ArtboardState> }>()
const previewCanvas = shallowRef<Record<string, ArtboardState>>()
const canvas = computed(() => props.canvasData || previewCanvas.value)
const hasCanvas = computed(() => hasBannerPreview(canvas.value))
const imageFailed = ref(false)
watch(() => props.thumbnailUrl, () => {
  imageFailed.value = false
})
const container = ref<HTMLElement | null>(null)
const visible = ref(false)
useIntersectionObserver(container, ([entry]) => {
  visible.value = entry?.isIntersecting === true
}, { rootMargin: '100px' })

// Keep only this tile's selected layout; page changes discard its local data.
let requestVersion = 0
let pendingVersion: number | undefined
onBeforeUnmount(() => {
  requestVersion++
})
watch([() => props.projectId, () => props.previewKey, () => props.previewVersion], () => {
  requestVersion++
  previewCanvas.value = undefined
})
watch([visible, () => props.projectId, () => props.previewKey, () => props.previewVersion], async ([isVisible, id, key]) => {
  if (!isVisible || !id || !key || props.canvasData || previewCanvas.value || pendingVersion === requestVersion) return
  const version = requestVersion
  pendingVersion = version
  try {
    const project = await $fetch<Pick<BannerProject, 'canvasData'>>(`/api/agency/banner-studio/projects/${encodeURIComponent(id)}`, {
      query: { previewFormat: key }
    })
    if (version === requestVersion) previewCanvas.value = project.canvasData
  } catch { /* Leave the imported thumbnail available if the saved preview cannot load. */ } finally {
    if (pendingVersion === version) pendingVersion = undefined
  }
}, { immediate: true })
</script>

<template>
  <div ref="container" class="flex items-center justify-center overflow-hidden bg-elevated" aria-hidden="true">
    <LazyBannerThumbnail v-if="visible && hasCanvas" :canvas-data="canvas!" :client-id="clientId" />
    <img
      v-else-if="!hasCanvas && !imageFailed && safeMediaUrl(thumbnailUrl)"
      :src="safeMediaUrl(thumbnailUrl)"
      alt=""
      loading="lazy"
      class="h-full w-full object-contain"
      @error="imageFailed = true"
    >
    <UIcon v-else name="i-lucide-image" class="size-6 text-muted" />
  </div>
</template>
