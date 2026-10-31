<script setup lang="ts">
import { layerSlideId, resolveSlides, slideRanges } from '~/utils/banner-slides'

const { selectedLayer, updateLayer, state, setLayerSlide } = useBannerStudio()
const toast = useToast()
function assignSlide(value: string) {
  if (!selectedLayer.value) return
  try {
    setLayerSlide(selectedLayer.value.id, value === '__all__' ? null : value)
  } catch (error) {
    toast.add({ title: 'Slide assignment not saved', description: error instanceof Error ? error.message : 'Please try again.', color: 'error' })
  }
}
const board = computed(() => state.sets[state.activeKey])
const slides = computed(() => slideRanges(resolveSlides(board.value)))
const ownership = computed(() => selectedLayer.value && board.value ? layerSlideId(board.value, selectedLayer.value) : undefined)
const owner = computed(() => slides.value.find(slide => slide.id === ownership.value))
const bounds = computed(() => ({ start: owner.value?.start || 0, end: owner.value?.end || state.duration || 5 }))
function setNum(key: string, value: string | number) {
  if (!selectedLayer.value || !Number.isFinite(Number(value))) return
  updateLayer(selectedLayer.value.id, { [key]: Number(value) })
}
</script>

<template>
  <details v-if="selectedLayer" open class="bs-section group">
    <summary class="flex cursor-pointer select-none items-center gap-1.5 rounded px-1 py-1.5 hover:bg-accented">
      <UIcon name="i-lucide-chevron-right" class="size-3 text-dimmed transition-transform group-open:rotate-90" />
      <span class="text-xs font-semibold text-muted">Presence</span>
    </summary>
    <div class="@container space-y-3 pt-2">
      <UFormField v-if="slides.length > 1" label="Show on slides">
        <USelect
          :model-value="ownership || '__all__'"
          :items="[{ label: 'All slides', value: '__all__' }, ...slides.map((slide, index) => ({ label: `${index + 1} · ${slide.name}`, value: slide.id }))]"
          class="w-full"
          @update:model-value="assignSlide"
        />
      </UFormField>
      <UFormField label="Start (seconds)">
        <UInput
          :model-value="selectedLayer.startTime"
          type="number"
          :min="bounds.start"
          :max="selectedLayer.endTime - 0.1"
          :step="0.1"
          class="w-full"
          @update:model-value="setNum('startTime', $event)"
        />
      </UFormField>
      <UFormField label="End (seconds)">
        <UInput
          :model-value="selectedLayer.endTime"
          type="number"
          :min="selectedLayer.startTime + 0.1"
          :max="bounds.end"
          :step="0.1"
          class="w-full"
          @update:model-value="setNum('endTime', $event)"
        />
      </UFormField>
    </div>
  </details>
</template>
