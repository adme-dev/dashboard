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
  <details v-if="selectedLayer" open class="bs-section group">
    <summary>
      <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
      <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Align</span>
    </summary>
    <div class="pt-1 grid grid-cols-6 gap-0.5 rounded-md bg-white/[0.03] p-0.5">
      <UButton
        v-for="btn in alignButtons"
        :key="btn.dir"
        :icon="btn.icon"
        variant="ghost"
        size="xs"
        color="neutral"
        class="justify-center"
        :title="btn.label"
        @click="alignLayers(btn.dir)"
      />
    </div>
  </details>
</template>
