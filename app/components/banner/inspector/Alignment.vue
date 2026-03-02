<script setup lang="ts">
const { selectedLayer, alignLayers } = useBannerStudio()

const alignButtons = [
  { icon: 'i-lucide-align-horizontal-justify-start', dir: 'left' as const, label: 'Align left' },
  { icon: 'i-lucide-align-horizontal-justify-center', dir: 'center-h' as const, label: 'Center horizontally' },
  { icon: 'i-lucide-align-horizontal-justify-end', dir: 'right' as const, label: 'Align right' },
  { icon: 'i-lucide-align-vertical-justify-start', dir: 'top' as const, label: 'Align top' },
  { icon: 'i-lucide-align-vertical-justify-center', dir: 'center-v' as const, label: 'Center vertically' },
  { icon: 'i-lucide-align-vertical-justify-end', dir: 'bottom' as const, label: 'Align bottom' },
]
</script>

<template>
  <div v-if="selectedLayer" class="space-y-2">
    <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">Align to Artboard</div>
    <div class="flex gap-0.5 flex-wrap">
      <UButton
        v-for="btn in alignButtons"
        :key="btn.dir"
        :icon="btn.icon"
        variant="ghost"
        size="xs"
        :title="btn.label"
        @click="alignLayers(btn.dir)"
      />
    </div>
  </div>
</template>
