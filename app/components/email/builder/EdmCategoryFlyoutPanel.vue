<!-- app/components/email/builder/EdmCategoryFlyoutPanel.vue -->
<!-- Top-docked module browser panel used by the left EDM rail. It mirrors the
     Postcards interaction model: category rail on the left, rich stacked
     previews opening immediately to its right. -->
<script setup lang="ts">
import type { EdmSectionCategory, EdmSectionPreset } from '~~/app/utils/edmPresets'

defineProps<{
  category: EdmSectionCategory
}>()

defineEmits<{
  insert: [preset: EdmSectionPreset]
}>()

function presetLabel(category: EdmSectionCategory, index: number) {
  const base = category.id === 'basic' ? 'Module' : category.label
  return `${base} ${index + 1}`.toUpperCase()
}
</script>

<template>
  <aside
    data-edm-category-flyout
    data-layout="top-docked"
    :aria-label="`${category.label} modules`"
    class="absolute left-full top-0 z-30 flex h-full w-[420px] flex-col border-r border-default bg-default shadow-xl"
  >
    <div class="flex-1 overflow-auto bg-elevated/40 px-4 py-3">
      <div v-if="category.id === 'basic'" class="grid grid-cols-2 gap-2">
        <button
          v-for="(preset, index) in category.presets"
          :key="preset.id"
          type="button"
          class="group flex min-h-24 flex-col items-start justify-between rounded-md border border-default bg-default p-3 text-left transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @click="$emit('insert', preset)"
        >
          <span class="text-[10px] font-semibold uppercase text-muted">
            {{ presetLabel(category, index) }}
          </span>
          <UIcon :name="preset.icon" class="mt-3 h-5 w-5 text-muted transition group-hover:text-primary" />
          <span class="mt-2 text-xs font-semibold leading-tight text-default">
            {{ preset.name }}
          </span>
        </button>
      </div>

      <div v-else class="space-y-4">
        <button
          v-for="(preset, index) in category.presets"
          :key="preset.id"
          type="button"
          class="group block w-full text-left focus-visible:outline-none"
          @click="$emit('insert', preset)"
        >
          <span class="mb-1 block text-[10px] font-semibold uppercase text-muted">
            {{ presetLabel(category, index) }}
          </span>
          <span
            class="block overflow-hidden rounded-md border border-default bg-default shadow-sm transition group-hover:border-primary group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary"
          >
            <span class="block overflow-hidden bg-white">
              <EmailBuilderEdmSectionThumbnail
                :preset="preset"
                :width="360"
                :max-height="420"
              />
            </span>
          </span>
        </button>
      </div>
    </div>
  </aside>
</template>
