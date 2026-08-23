<script setup lang="ts">
const { selectedLayer, updateLayer } = useBannerStudio()

function set(key: string, val: string | number) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: Number(val) })
}
</script>

<template>
  <div v-if="selectedLayer">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Position & Size</span>
      </summary>
      <div class="pt-1.5 space-y-2">
    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">X</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.x" @update:model-value="v => set('x', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Y</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.y" @update:model-value="v => set('y', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">W</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.w" @update:model-value="v => set('w', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">H</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.h" @update:model-value="v => set('h', v)" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Rotation</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.rotation ?? 0" @update:model-value="v => set('rotation', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Z-Index</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.zIndex" @update:model-value="v => set('zIndex', v)" />
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between mb-1">
              <label class="mb-0">Opacity</label>
              <span class="font-mono text-[9px] text-(--ui-text-dimmed) tabular-nums">{{ (selectedLayer.opacity * 100).toFixed(0) }}%</span>
            </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="selectedLayer.opacity"
        @input="(e: Event) => set('opacity', (e.target as HTMLInputElement).value)"
      >
    </div>
      </div>
    </details>
  </div>
</template>
