<script setup lang="ts">
import { LAYER_ICONS } from '~/utils/banner-constants'
import type { Layer } from '~/types/banner-studio'

const { slideLayers, moveSlideLayer, selectLayer } = useBannerStudio()
const { state, slides, currentSlide, selectSlide } = useBannerSlides()
const { pauseTimeline } = useBannerTimeline()
const { isLayerLockedByOther } = useBannerRealtime()
const slideIndex = computed(() => slides.value.findIndex(slide => slide.id === currentSlide.value?.id))
const dragged = ref<number | null>(null)
const over = ref<number | null>(null)

function locked(layer: Layer) {
  return layer.locked || isLayerLockedByOther(layer.id)
}
function select(id: number) {
  pauseTimeline()
  selectLayer(id)
}
function move(id: number, target?: Layer) {
  const layer = slideLayers.value.find(item => item.id === id)
  if (!target || !layer || locked(layer) || id === target.id) return
  select(id)
  moveSlideLayer(id, target.id)
}
function endDrag() {
  dragged.value = null
  over.value = null
}
watch([() => state.project?.id, () => state.activeKey, () => currentSlide.value?.id], endDrag)
function startDrag(event: DragEvent, layer: Layer) {
  if (locked(layer) || !event.dataTransfer) return event.preventDefault()
  pauseTimeline()
  dragged.value = layer.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', layer.name)
}
function dragOver(event: DragEvent, id: number) {
  if (dragged.value === null) return
  event.preventDefault()
  over.value = id
}
function drop(target: Layer) {
  if (dragged.value !== null) move(dragged.value, target)
  endDrag()
}
</script>

<template>
  <section aria-label="Layers panel" class="p-3">
    <h2 class="text-sm font-semibold">Layers</h2>
    <div v-if="currentSlide" class="my-2 flex items-center gap-1">
      <p class="mr-auto min-w-0 truncate text-xs text-muted">{{ currentSlide.name }}</p>
      <template v-if="slides.length > 1">
        <UButton icon="i-lucide-chevron-left" aria-label="Previous slide" size="xs" color="neutral" variant="ghost"
          :disabled="slideIndex <= 0" @click="selectSlide(slideIndex - 1)" />
        <span class="text-xs tabular-nums text-muted">{{ slideIndex + 1 }} / {{ slides.length }}</span>
        <UButton icon="i-lucide-chevron-right" aria-label="Next slide" size="xs" color="neutral" variant="ghost"
          :disabled="slideIndex >= slides.length - 1" @click="selectSlide(slideIndex + 1)" />
      </template>
    </div>
    <ol aria-label="Layer stacking order" class="space-y-1">
      <li v-for="(layer, index) in slideLayers" :key="layer.id"
        class="group flex items-center gap-0.5 rounded-md px-1"
        :class="[state.selectedLayerId === layer.id ? 'bg-primary/15 text-primary' : 'hover:bg-accented',
          over === layer.id && dragged !== layer.id ? 'ring-1 ring-primary' : '']"
        :draggable="!locked(layer)" @dragstart="startDrag($event, layer)" @dragend="endDrag"
        @dragover="dragOver($event, layer.id)" @drop.prevent="drop(layer)">
        <UIcon :name="locked(layer) ? 'i-lucide-lock' : 'i-lucide-grip-vertical'"
          class="size-3.5 shrink-0 text-muted" :class="{ 'cursor-grab': !locked(layer) }" />
        <UButton :icon="LAYER_ICONS[layer.type]" :label="layer.name" :title="layer.name"
          :aria-pressed="state.selectedLayerId === layer.id" variant="ghost" color="neutral" size="sm"
          class="min-w-0 flex-1 justify-start" :class="{ 'opacity-60': layer.hidden }"
          :ui="{ label: 'truncate' }" @click="select(layer.id)" />
        <div class="flex shrink-0" :class="{ 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100': state.selectedLayerId !== layer.id }">
          <UButton icon="i-lucide-chevron-up" :aria-label="`Move ${layer.name} forward`" title="Move forward"
            color="neutral" variant="ghost" size="xs" :disabled="locked(layer) || index === 0"
            @click="move(layer.id, slideLayers[index - 1])" />
          <UButton icon="i-lucide-chevron-down" :aria-label="`Move ${layer.name} backward`" title="Move backward"
            color="neutral" variant="ghost" size="xs" :disabled="locked(layer) || index === slideLayers.length - 1"
            @click="move(layer.id, slideLayers[index + 1])" />
        </div>
      </li>
    </ol>
    <p v-if="!slideLayers.length" class="py-3 text-xs text-muted">No layers on this slide.</p>
  </section>
</template>
