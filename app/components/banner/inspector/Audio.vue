<script setup lang="ts">
const { selectedLayer, updateLayer } = useBannerStudio()

const volume = computed({
  get: () => selectedLayer.value?.volume ?? 1,
  set: (v: number) => {
    if (selectedLayer.value) updateLayer(selectedLayer.value.id, { volume: v })
  },
})

const muted = computed({
  get: () => selectedLayer.value?.muted ?? false,
  set: (v: boolean) => {
    if (selectedLayer.value) updateLayer(selectedLayer.value.id, { muted: v })
  },
})

const loopAudio = computed({
  get: () => selectedLayer.value?.loopAudio ?? false,
  set: (v: boolean) => {
    if (selectedLayer.value) updateLayer(selectedLayer.value.id, { loopAudio: v })
  },
})

const fileName = computed(() => {
  if (!selectedLayer.value?.src) return 'No source'
  try {
    const url = new URL(selectedLayer.value.src)
    return decodeURIComponent(url.pathname.split('/').pop() || 'audio file')
  } catch {
    return selectedLayer.value.src
  }
})
</script>

<template>
  <div v-if="selectedLayer" class="space-y-3">
    <div class="text-[10px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">Audio</div>

    <!-- Source -->
    <div class="space-y-1">
      <label class="text-[10px] text-(--ui-text-dimmed)">Source</label>
      <div class="text-[11px] text-(--ui-text-muted) truncate px-2 py-1.5 rounded bg-(--ui-bg) border border-(--ui-border)">
        {{ fileName }}
      </div>
    </div>

    <!-- Volume -->
    <div class="space-y-1">
      <div class="flex items-center justify-between">
        <label class="text-[10px] text-(--ui-text-dimmed)">Volume</label>
        <span class="text-[10px] font-mono text-(--ui-text-muted)">{{ Math.round(volume * 100) }}%</span>
      </div>
      <input
        v-model.number="volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        class="w-full"
      >
    </div>

    <!-- Mute -->
    <div class="flex items-center gap-2">
      <UCheckbox v-model="muted" />
      <label class="text-[11px] text-(--ui-text)">Mute</label>
    </div>

    <!-- Loop -->
    <div class="flex items-center gap-2">
      <UCheckbox v-model="loopAudio" />
      <label class="text-[11px] text-(--ui-text)">Loop audio</label>
    </div>
  </div>
</template>
