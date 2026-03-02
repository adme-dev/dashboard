<script setup lang="ts">
const { selectedLayer, updateLayer, state } = useBannerStudio()

function setNum(key: string, val: string | number) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: Number(val) })
}

const presencePercent = computed(() => {
  if (!selectedLayer.value) return { left: 0, width: 100 }
  const dur = state.duration || 5
  const start = selectedLayer.value.startTime ?? 0
  const end = selectedLayer.value.endTime ?? dur
  return {
    left: (start / dur) * 100,
    width: ((end - start) / dur) * 100,
  }
})
</script>

<template>
  <div v-if="selectedLayer">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Presence</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <!-- Visual presence bar -->
    <div class="relative h-4 rounded bg-(--ui-bg-elevated) overflow-hidden">
      <div
        class="absolute top-0 bottom-0 rounded bg-(--ui-primary)/30"
        :style="{ left: presencePercent.left + '%', width: presencePercent.width + '%' }"
      />
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Start (s)</label>
        <div class="flex items-center gap-1.5">
          <input
            type="range"
            min="0"
            :max="state.duration"
            step="0.1"
            :value="selectedLayer.startTime"
            class="flex-1 h-1 accent-(--ui-primary)"
            @input="(e: Event) => setNum('startTime', (e.target as HTMLInputElement).value)"
          />
          <UInput
            type="number"
            size="xs"
            step="0.1"
            class="w-14"
            :model-value="selectedLayer.startTime"
            @update:model-value="v => setNum('startTime', v)"
          />
        </div>
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">End (s)</label>
        <div class="flex items-center gap-1.5">
          <input
            type="range"
            :min="selectedLayer.startTime"
            :max="state.duration"
            step="0.1"
            :value="selectedLayer.endTime"
            class="flex-1 h-1 accent-(--ui-primary)"
            @input="(e: Event) => setNum('endTime', (e.target as HTMLInputElement).value)"
          />
          <UInput
            type="number"
            size="xs"
            step="0.1"
            class="w-14"
            :model-value="selectedLayer.endTime"
            @update:model-value="v => setNum('endTime', v)"
          />
        </div>
      </div>
    </div>
      </div>
    </details>
  </div>
</template>
