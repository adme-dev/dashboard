<script setup lang="ts">
const { selectedLayer, activeLayers, toggleMask, setMaskTargets, updateLayer } = useBannerStudio()

const MASKABLE_TYPES = new Set(['rect', 'image', 'text', 'button'])

const canBeMask = computed(() => {
  return selectedLayer.value ? MASKABLE_TYPES.has(selectedLayer.value.type) : false
})

const availableTargets = computed(() => {
  if (!selectedLayer.value) return []
  return activeLayers.value.filter(l =>
    l.id !== selectedLayer.value!.id
    && l.type !== 'bg'
    && l.type !== 'audio'
    && !l.isMask,
  )
})

function onToggleMask(checked: boolean) {
  if (!selectedLayer.value) return
  toggleMask(selectedLayer.value.id)
}

function isTargeted(layerId: number): boolean {
  return selectedLayer.value?.maskTargetIds?.includes(layerId) ?? false
}

function toggleTarget(layerId: number) {
  if (!selectedLayer.value?.maskTargetIds) return
  const current = selectedLayer.value.maskTargetIds
  const newTargets = isTargeted(layerId)
    ? current.filter(id => id !== layerId)
    : [...current, layerId]
  setMaskTargets(selectedLayer.value.id, newTargets)
}
</script>

<template>
  <div v-if="selectedLayer && canBeMask">
    <details class="bs-section group" :open="selectedLayer.isMask || undefined">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <UIcon name="i-lucide-scan" class="w-3 h-3 text-[#e84aff]" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Mask</span>
      </summary>
      <div class="pt-1.5 space-y-3">
        <!-- Use as Mask toggle -->
        <div class="flex items-center gap-2">
          <UCheckbox
            :model-value="!!selectedLayer.isMask"
            @update:model-value="onToggleMask"
          />
          <label class="text-[11px] text-(--ui-text-muted)">Use as Mask</label>
        </div>

        <template v-if="selectedLayer.isMask">
          <!-- Shape selector -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) block mb-1">Shape</label>
            <div class="flex gap-1">
              <UButton
                size="xs"
                :variant="selectedLayer.maskShape === 'rect' ? 'solid' : 'ghost'"
                icon="i-lucide-square"
                @click="updateLayer(selectedLayer.id, { maskShape: 'rect' })"
              >
                Rect
              </UButton>
              <UButton
                size="xs"
                :variant="selectedLayer.maskShape === 'ellipse' ? 'solid' : 'ghost'"
                icon="i-lucide-circle"
                @click="updateLayer(selectedLayer.id, { maskShape: 'ellipse' })"
              >
                Ellipse
              </UButton>
            </div>
          </div>

          <!-- Invert toggle -->
          <div class="flex items-center gap-2">
            <UCheckbox
              :model-value="!!selectedLayer.maskInvert"
              @update:model-value="(v: boolean) => updateLayer(selectedLayer!.id, { maskInvert: v })"
            />
            <label class="text-[11px] text-(--ui-text-muted)">Invert Mask</label>
          </div>

          <!-- Masked Layers checklist -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) block mb-1">Masked Layers</label>
            <div v-if="availableTargets.length === 0" class="text-[10px] text-[#555] italic">
              No layers available
            </div>
            <div v-else class="space-y-1 max-h-32 overflow-y-auto">
              <div
                v-for="layer in availableTargets"
                :key="layer.id"
                class="flex items-center gap-2 py-0.5"
              >
                <UCheckbox
                  :model-value="isTargeted(layer.id)"
                  @update:model-value="() => toggleTarget(layer.id)"
                />
                <span class="text-[10px] text-(--ui-text) truncate">{{ layer.name }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>
