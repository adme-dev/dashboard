<script setup lang="ts">
const { selectedLayer, updateLayer } = useBannerStudio()

function set(key: string, val: any) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: val })
}

function setNum(key: string, val: string | number) {
  set(key, Number(val))
}

// The blur control edits only a plain blur; other imported filter chains stay as they are.
const blur = computed(() => {
  const filter = selectedLayer.value?.visualFilter
  if (!filter || filter === 'none') return 0
  const match = /^blur\((\d+(?:\.\d+)?)px\)$/.exec(filter)
  return match ? Number(match[1]) : null
})

function setBlur(val: string | number) {
  const amount = Math.min(100, Math.max(0, Number(val) || 0))
  set('visualFilter', amount ? `blur(${amount}px)` : undefined)
}
</script>

<template>
  <div v-if="selectedLayer">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-accented">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-dimmed transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Rectangle</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Fill Color</label>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="selectedLayer.fillColor ?? '#000000'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('fillColor', (e.target as HTMLInputElement).value)"
        />
        <UInput size="xs" class="flex-1" :model-value="selectedLayer.fillColor ?? '#000000'" @update:model-value="v => set('fillColor', v)" />
      </div>
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Shape</label>
      <USelect
        size="xs"
        class="w-full"
        :items="[{ label: 'Rectangle', value: 'rect' }, { label: 'Ellipse', value: 'ellipse' }]"
        :model-value="selectedLayer.rectShape ?? 'rect'"
        @update:model-value="v => set('rectShape', v === 'ellipse' ? 'ellipse' : undefined)"
      />
    </div>

    <div v-if="selectedLayer.rectShape !== 'ellipse'">
      <label class="text-[10px] text-(--ui-text-muted)">Border Radius</label>
      <UInput type="number" size="xs" :model-value="selectedLayer.borderRadius ?? 0" @update:model-value="v => setNum('borderRadius', v)" />
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Blur (px)</label>
      <UInput v-if="blur !== null" type="number" size="xs" min="0" max="100" :model-value="blur" @update:model-value="v => setBlur(v)" />
      <p v-else class="text-[10px] text-(--ui-text-dimmed)">Imported filter: {{ selectedLayer.visualFilter }}</p>
    </div>
      </div>
    </details>
  </div>
</template>
