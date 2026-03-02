<script setup lang="ts">
const { selectedLayer, updateLayer, activeFormat } = useBannerStudio()

function set(key: string, val: any) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: val })
}

const fitOptions = [
  { label: 'Cover', value: 'cover' },
  { label: 'Contain', value: 'contain' },
  { label: 'Fill', value: 'fill' },
]

function setAsBackground() {
  if (!selectedLayer.value || !activeFormat.value) return
  updateLayer(selectedLayer.value.id, {
    x: 0,
    y: 0,
    w: activeFormat.value.w,
    h: activeFormat.value.h,
    zIndex: 1,
    fit: 'cover',
    animIn: 'fadeIn',
  })
}
</script>

<template>
  <div v-if="selectedLayer">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Video</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Source</label>
      <UInput size="xs" :model-value="selectedLayer.src ?? ''" readonly class="opacity-70" />
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Object Fit</label>
      <USelectMenu
        size="xs"
        :model-value="selectedLayer.fit ?? 'cover'"
        :items="fitOptions"
        @update:model-value="v => set('fit', v)"
      />
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Border Radius</label>
      <UInput type="number" size="xs" :model-value="selectedLayer.borderRadius ?? 0" @update:model-value="v => set('borderRadius', Number(v))" />
    </div>

    <UButton size="xs" variant="soft" icon="i-lucide-maximize" class="w-full" @click="setAsBackground">
      Set as Background
    </UButton>
      </div>
    </details>
  </div>
</template>
