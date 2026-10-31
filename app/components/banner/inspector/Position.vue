<script setup lang="ts">
const { selectedLayer, updateLayer } = useBannerStudio()
const { isLayerLockedByOther } = useBannerRealtime()
const locked = computed(() => !!selectedLayer.value?.locked || isLayerLockedByOther(selectedLayer.value?.id ?? -1))
const dimensions = [
  { key: 'x', label: 'X' }, { key: 'y', label: 'Y' },
  { key: 'w', label: 'Width' }, { key: 'h', label: 'Height' },
  { key: 'rotation', label: 'Rotation' }, { key: 'zIndex', label: 'Layer order' }
] as const
function set(key: string, value: string | number) {
  if (!selectedLayer.value || locked.value || value === '') return
  const number = Number(value)
  if (!Number.isFinite(number) || (['w', 'h'].includes(key) && number <= 0)) return
  updateLayer(selectedLayer.value.id, { [key]: number })
}
function flip(key: 'flipX' | 'flipY') {
  if (!selectedLayer.value || locked.value) return
  updateLayer(selectedLayer.value.id, { [key]: !selectedLayer.value[key] })
}
</script>

<template>
  <details v-if="selectedLayer" open class="bs-section group @container">
    <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-accented">
      <UIcon name="i-lucide-chevron-right" class="size-3 text-dimmed transition-transform group-open:rotate-90" />
      <span class="text-xs font-medium text-muted">Layer</span>
    </summary>
    <div class="pt-1.5 space-y-4">
      <div class="grid grid-cols-1 @min-[14rem]:grid-cols-2 gap-4">
        <UFormField v-for="field in dimensions" :key="field.key" :label="field.label">
          <UInput
            type="number"
            size="sm"
            class="w-full"
            :disabled="locked"
            :model-value="selectedLayer[field.key] ?? 0"
            @update:model-value="value => set(field.key, value)"
          />
        </UFormField>
      </div>
      <UFormField v-if="!selectedLayer.isMask && selectedLayer.type !== 'audio'" label="Flip layer">
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-flip-horizontal-2"
            label="Horizontal"
            size="xs"
            color="neutral"
            :variant="selectedLayer.flipX ? 'soft' : 'outline'"
            :aria-pressed="!!selectedLayer.flipX"
            :disabled="locked"
            @click="flip('flipX')"
          />
          <UButton
            icon="i-lucide-flip-vertical-2"
            label="Vertical"
            size="xs"
            color="neutral"
            :variant="selectedLayer.flipY ? 'soft' : 'outline'"
            :aria-pressed="!!selectedLayer.flipY"
            :disabled="locked"
            @click="flip('flipY')"
          />
        </div>
      </UFormField>
      <UFormField :label="`Opacity · ${Math.round(selectedLayer.opacity * 100)}%`">
        <USlider
          :model-value="selectedLayer.opacity"
          :min="0"
          :max="1"
          :step="0.05"
          :disabled="locked"
          @update:model-value="value => set('opacity', Number(value))"
        />
      </UFormField>
    </div>
  </details>
</template>
