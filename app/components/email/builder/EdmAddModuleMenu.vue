<!-- app/components/email/builder/EdmAddModuleMenu.vue -->
<!-- Unified "Add module" bubble content. Leads with Basic modules as a compact
     icon grid (quick-add feel), with every section category reachable in the
     same bubble (switch category → live thumbnail cards). Used by both the
     end-of-canvas "Add block" trigger and the empty-canvas state. Owns its own
     active-category state so it always opens on Basic. -->
<script setup lang="ts">
import { EDM_SECTION_CATEGORIES } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'

defineEmits<{ insert: [preset: EdmSectionPreset] }>()

// Own category state, defaulting to Basic so the bubble always opens on the
// compact icon grid regardless of any parent selection.
const activeCategoryId = ref<string>('basic')
const activeCategory = computed(() => {
  return (
    EDM_SECTION_CATEGORIES.find(category => category.id === activeCategoryId.value)
    || EDM_SECTION_CATEGORIES[0]
  )
})
</script>

<template>
  <div class="flex w-[460px] max-h-[60vh]">
    <!-- Mini category rail -->
    <div class="w-36 shrink-0 border-r border-default p-2 overflow-auto">
      <button
        v-for="category in EDM_SECTION_CATEGORIES"
        :key="category.id"
        type="button"
        class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
        :class="activeCategoryId === category.id ? 'bg-elevated text-default font-semibold' : 'text-muted hover:text-default hover:bg-elevated/60'"
        @click="activeCategoryId = category.id"
      >
        <UIcon :name="category.icon" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{{ category.label }}</span>
      </button>
    </div>

    <!-- Right pane -->
    <div class="flex-1 overflow-auto p-3">
      <!-- Basic: compact icon grid (quick-add bubble) -->
      <div v-if="activeCategoryId === 'basic'" class="grid grid-cols-3 gap-2">
        <button
          v-for="preset in activeCategory?.presets"
          :key="preset.id"
          type="button"
          class="flex flex-col items-center justify-center gap-1.5 rounded-md border border-default bg-default p-3 text-center transition hover:border-primary hover:bg-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @click="$emit('insert', preset)"
        >
          <UIcon :name="preset.icon" class="h-5 w-5 text-muted" />
          <span class="text-[11px] font-medium leading-tight text-default">{{ preset.name }}</span>
        </button>
      </div>

      <!-- Section categories: live thumbnail cards -->
      <div v-else class="space-y-3">
        <button
          v-for="preset in activeCategory?.presets"
          :key="preset.id"
          type="button"
          class="block w-full overflow-hidden rounded-md border border-default bg-default text-left transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @click="$emit('insert', preset)"
        >
          <div class="h-28 overflow-hidden bg-elevated/40 flex items-start justify-center">
            <EmailBuilderEdmSectionThumbnail :preset="preset" :width="240" />
          </div>
          <div class="p-2">
            <p class="text-xs font-semibold">{{ preset.name }}</p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
