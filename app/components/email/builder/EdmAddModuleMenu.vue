<!-- app/components/email/builder/EdmAddModuleMenu.vue -->
<!-- Unified "Add module" bubble content. Leads with Basic modules as a compact
     icon grid (quick-add feel), with every section category reachable in the
     same bubble (switch category → live thumbnail cards). A "Custom Modules"
     category surfaces the user's own saved sections (Phase 2). Used by both the
     end-of-canvas "Add block" trigger and the empty-canvas state. Owns its own
     active-category state so it always opens on Basic. -->
<script setup lang="ts">
import { EDM_SECTION_CATEGORIES } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import { fragmentTopLevelTemplates } from '~~/app/utils/edmModuleFragment'
import { groupCustomModulesByCategory } from '~~/app/utils/edmCustomModuleCategories'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

defineEmits<{
  insert: [preset: EdmSectionPreset]
  insertModule: [module: EdmCustomModule]
  renameModule: [module: EdmCustomModule]
  deleteModule: [module: EdmCustomModule]
}>()

const props = withDefaults(defineProps<{
  initialCategoryId?: string
}>(), {
  initialCategoryId: 'basic'
})

const CUSTOM_ID = '__custom__'

const customModules = useEdmCustomModules()
onMounted(() => customModules.load())

// Own category state, defaulting to Basic so the bubble always opens on the
// compact icon grid regardless of any parent selection.
const activeCategoryId = ref<string>(props.initialCategoryId)
const activeCategory = computed(() => {
  return (
    EDM_SECTION_CATEGORIES.find(category => category.id === activeCategoryId.value)
    || EDM_SECTION_CATEGORIES[0]
  )
})
const customModuleGroups = computed(() => groupCustomModulesByCategory(customModules.modules.value))

// Render a saved module's thumbnail through EdmSectionThumbnail by adapting it
// to the preset shape the thumbnail expects (only reads blocks + previewTone).
function moduleThumbPreset(m: EdmCustomModule): EdmSectionPreset {
  return {
    id: m.id,
    categoryId: 'header',
    kind: 'section',
    name: m.name,
    description: m.description ?? '',
    icon: 'i-lucide-bookmark',
    previewTone: m.preview_tone,
    blocks: fragmentTopLevelTemplates(m.blocks)
  } as EdmSectionPreset
}
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
      <!-- Custom Modules: the user's saved sections -->
      <button
        type="button"
        class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors mt-1 border-t border-default pt-2"
        :class="activeCategoryId === CUSTOM_ID ? 'bg-elevated text-default font-semibold' : 'text-muted hover:text-default hover:bg-elevated/60'"
        @click="activeCategoryId = CUSTOM_ID"
      >
        <UIcon name="i-lucide-bookmark" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">Custom Modules</span>
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

      <!-- Custom Modules: saved sections with manage actions -->
      <div v-else-if="activeCategoryId === CUSTOM_ID" class="space-y-3">
        <div v-if="customModules.loading.value && customModules.modules.value.length === 0" class="py-8 text-center text-xs text-muted">
          Loading saved modules…
        </div>
        <div
          v-else-if="customModules.modules.value.length === 0"
          class="flex flex-col items-center justify-center py-10 text-center"
        >
          <UIcon name="i-lucide-bookmark-plus" class="h-8 w-8 text-muted/40 mb-3" />
          <p class="text-sm font-medium text-default">No saved modules yet</p>
          <p class="mt-1 text-xs text-muted leading-snug max-w-[220px]">
            Select any block on the canvas and choose <span class="font-medium">Save module</span>
            to reuse it here.
          </p>
        </div>
        <div v-for="group in customModuleGroups" :key="group.category" class="space-y-2">
          <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <UIcon :name="group.icon" class="h-3.5 w-3.5 shrink-0" />
            <span>{{ group.label }}</span>
          </div>
          <div
            v-for="m in group.modules"
            :key="m.id"
            class="group relative overflow-hidden rounded-md border border-default bg-default transition hover:border-primary hover:shadow-sm"
          >
            <button
              type="button"
              class="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              @click="$emit('insertModule', m)"
            >
              <div class="h-28 overflow-hidden bg-elevated/40 flex items-start justify-center">
                <EmailBuilderEdmSectionThumbnail :preset="moduleThumbPreset(m)" :width="240" />
              </div>
              <div class="p-2">
                <p class="text-xs font-semibold truncate">{{ m.name }}</p>
                <p v-if="m.description" class="mt-0.5 text-[11px] text-muted leading-snug truncate">{{ m.description }}</p>
              </div>
            </button>
            <!-- Manage actions (appear on hover/focus) -->
            <div class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <UTooltip text="Rename">
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="solid"
                  color="neutral"
                  @click.stop="$emit('renameModule', m)"
                />
              </UTooltip>
              <UTooltip text="Delete">
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="solid"
                  color="error"
                  @click.stop="$emit('deleteModule', m)"
                />
              </UTooltip>
            </div>
          </div>
        </div>
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
