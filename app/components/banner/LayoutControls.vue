<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { layoutName } from '~/utils/banner-workspace'
const { state, activeFormat, allFormats, setLayoutView } = useBannerStudio()
const showSizePicker = inject<Ref<boolean>>('showSizePicker', ref(false))
const layoutMenuItems = computed(() => [[
  { label: 'All layouts', icon: 'i-lucide-panels-top-left', onSelect: () => setLayoutView('all') },
  ...allFormats.value.map(format => ({
    label: `${layoutName(format)} · ${format.w} × ${format.h}`,
    icon: state.activeKey === format.key ? 'i-lucide-check' : 'i-lucide-square',
    onSelect: () => setLayoutView('single', format.key),
  })),
], [{ label: 'Add size…', icon: 'i-lucide-plus', onSelect: () => { showSizePicker.value = true } }]])

</script>

<template>
  <div class="flex flex-wrap items-center gap-2" aria-label="Layout editing mode">
    <span class="text-xs text-muted">Working with</span>
    <div class="flex rounded-lg bg-elevated p-0.5" role="group" aria-label="Editing scope">
      <UTooltip text="All layouts — edit linked content across sizes">
        <UButton icon="i-lucide-panels-top-left" label="All layouts" size="xs" color="neutral"
          :variant="state.layoutView === 'all' ? 'soft' : 'ghost'" :aria-pressed="state.layoutView === 'all'"
          @click="setLayoutView('all')" />
      </UTooltip>
      <UTooltip text="Single edit — changes apply only to this size">
        <UButton icon="i-lucide-focus" label="Single edit" size="xs" color="neutral"
          :variant="state.layoutView === 'single' ? 'soft' : 'ghost'" :aria-pressed="state.layoutView === 'single'"
          @click="setLayoutView('single')" />
      </UTooltip>
    </div>
    <UDropdownMenu :items="layoutMenuItems">
      <UButton :label="state.layoutView === 'all' ? `All layouts (${state.setKeys.length})` : `${layoutName(activeFormat || undefined)} · ${activeFormat?.w} × ${activeFormat?.h}`"
        aria-label="Choose layout" trailing-icon="i-lucide-chevron-down" color="neutral" variant="outline" size="xs" />
    </UDropdownMenu>
    <span class="text-xs text-muted hidden @5xl:inline">{{ state.layoutView === 'all' ? 'Linked content edits across sizes' : 'Editing this size only · Esc to exit' }}</span>
  </div>

</template>
