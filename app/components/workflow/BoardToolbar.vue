<script setup lang="ts">
import type { BoardViewType, KanbanFilters, SortRule, TaskPriority, GlobalTag, BoardGroupingOption, SortingPreset } from '~/types'

const props = defineProps<{
  departmentId?: string
  currentView: BoardViewType
  filters: KanbanFilters
  sortConfig?: SortRule[]
  groupBy?: string
}>()

const emit = defineEmits<{
  'update:currentView': [view: BoardViewType]
  'update:filters': [filters: KanbanFilters]
  'update:sortConfig': [sortConfig: SortRule[]]
  'update:groupBy': [groupBy: string | undefined]
  saveView: []
}>()

// Fetch department members for assignee filter
const { data: membersData } = useLazyAsyncData(
  `toolbar-members-${props.departmentId}`,
  () => $fetch('/api/agency/team-members', { query: { active: 'true' } }) as Promise<{ members: any[] }>,
  { default: () => ({ members: [] }), watch: [() => props.departmentId] }
)

// Fetch tags for tag filter
const { data: tagsData } = useLazyAsyncData(
  'toolbar-tags',
  () => $fetch('/api/agency/tags', { query: { limit: 50 } }) as Promise<any[]>
)

// Fetch grouping options
const { data: groupingOptions } = useLazyAsyncData(
  `toolbar-grouping-${props.departmentId}`,
  () => $fetch('/api/agency/grouping/options', { query: { departmentId: props.departmentId } }) as Promise<{ options: any[] }>,
  { watch: [() => props.departmentId] }
)

// Fetch sorting presets
const { data: sortingPresets } = useLazyAsyncData(
  `toolbar-sorting-${props.departmentId}`,
  () => $fetch('/api/agency/sorting/presets', { query: { departmentId: props.departmentId } }) as Promise<any[]>,
  { watch: [() => props.departmentId] }
)

const members = computed(() => membersData.value?.members || [])
const tags = computed(() => (Array.isArray(tagsData.value) ? tagsData.value : (tagsData.value as any)?.tags || []) as GlobalTag[])
const groupOptions = computed(() => (groupingOptions.value?.options as BoardGroupingOption[]) || [])
const presets = computed(() => (sortingPresets.value as SortingPreset[]) || [])

// Local filter state
const localFilters = ref<KanbanFilters>({ ...props.filters })
const searchDebounce = ref<ReturnType<typeof setTimeout> | null>(null)
const showFilters = ref(false)

// Priority options - XeroFlow colors
const priorityOptions = [
  { value: 'urgent', label: 'Urgent', color: '#FF6B6B' },
  { value: 'high', label: 'High', color: '#F4B942' },
  { value: 'medium', label: 'Medium', color: '#13B5EA' },
  { value: 'low', label: 'Low', color: '#7DD3A8' }
]

// View options
const viewOptions = [
  { value: 'kanban', label: 'Board', icon: 'i-lucide-kanban' },
  { value: 'table', label: 'Table', icon: 'i-lucide-table' },
  { value: 'timeline', label: 'Timeline', icon: 'i-lucide-gantt-chart' },
  { value: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar' }
]

watch(() => props.filters, (newFilters) => {
  localFilters.value = { ...newFilters }
}, { deep: true })

function updateSearch(value: string) {
  if (searchDebounce.value) {
    clearTimeout(searchDebounce.value)
  }
  searchDebounce.value = setTimeout(() => {
    emit('update:filters', { ...localFilters.value, search: value || undefined })
  }, 300)
}

function updateAssignee(assigneeId: string | undefined) {
  emit('update:filters', { ...localFilters.value, assigneeId })
}

function updatePriority(priority: TaskPriority | undefined) {
  emit('update:filters', { ...localFilters.value, priority })
}

function updateTags(tagIds: string[]) {
  emit('update:filters', { ...localFilters.value, tags: tagIds.length ? tagIds : undefined })
}

function toggleShowCompleted() {
  emit('update:filters', {
    ...localFilters.value,
    showCompleted: !localFilters.value.showCompleted
  })
}

function applyPreset(preset: SortingPreset) {
  emit('update:sortConfig', preset.sortRules)
}

function clearFilters() {
  localFilters.value = {}
  emit('update:filters', {})
}

const hasActiveFilters = computed(() => {
  return !!(
    localFilters.value.assigneeId ||
    localFilters.value.priority ||
    localFilters.value.search ||
    localFilters.value.tags?.length ||
    localFilters.value.showCompleted
  )
})

const activeFiltersCount = computed(() => {
  let count = 0
  if (localFilters.value.assigneeId) count++
  if (localFilters.value.priority) count++
  if (localFilters.value.search) count++
  if (localFilters.value.tags?.length) count++
  if (localFilters.value.showCompleted) count++
  return count
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Main Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <!-- View Switcher -->
      <div class="flex items-center border border-default rounded overflow-hidden">
        <button
          v-for="view in viewOptions"
          :key="view.value"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
          :class="currentView === view.value ? 'bg-inverted text-inverted' : 'text-muted hover:text-default hover:bg-elevated/50'"
          @click="emit('update:currentView', view.value as BoardViewType)"
        >
          <UIcon :name="view.icon" class="w-4 h-4" />
          <span class="hidden sm:inline">{{ view.label }}</span>
        </button>
      </div>

      <div class="w-px h-6 bg-default" />

      <!-- Search -->
      <UInput
        :model-value="localFilters.search"
        placeholder="Search tasks..."
        icon="i-lucide-search"
        class="w-48"
        @update:model-value="updateSearch($event)"
      />

      <!-- Toggle Filters -->
      <button
        class="flex items-center gap-2 px-3 py-2 border border-default rounded text-sm font-medium transition-colors"
        :class="showFilters ? 'bg-inverted text-inverted' : 'text-muted hover:text-default hover:bg-elevated/50'"
        @click="showFilters = !showFilters"
      >
        <UIcon name="i-lucide-filter" class="w-4 h-4" />
        <span>Filters</span>
        <span
          v-if="activeFiltersCount > 0"
          class="ml-1 px-1.5 py-0.5 text-xs rounded bg-primary text-white"
        >
          {{ activeFiltersCount }}
        </span>
      </button>

      <div class="flex-1" />

      <!-- Show Completed Toggle -->
      <button
        class="flex items-center gap-2 px-3 py-2 border rounded text-sm font-medium transition-colors"
        :class="localFilters.showCompleted ? 'bg-success border-success text-white' : 'border-default text-muted hover:text-default'"
        @click="toggleShowCompleted"
      >
        <UIcon :name="localFilters.showCompleted ? 'i-lucide-check-circle' : 'i-lucide-circle'" class="w-4 h-4" />
        <span class="hidden sm:inline">Completed</span>
      </button>

      <!-- Save View -->
      <button
        class="flex items-center gap-2 px-3 py-2 border border-default rounded text-sm font-medium text-muted hover:text-default hover:bg-elevated/50 transition-colors"
        @click="emit('saveView')"
      >
        <UIcon name="i-lucide-save" class="w-4 h-4" />
        <span class="hidden sm:inline">Save</span>
      </button>
    </div>

    <!-- Expanded Filters -->
    <div v-if="showFilters" class="flex items-center gap-3 flex-wrap p-4 border border-default rounded-lg bg-elevated/50">
      <!-- Assignee Filter -->
      <UFormField label="Assignee">
        <USelectMenu
          :model-value="localFilters.assigneeId || 'all'"
          :items="[{ label: 'All assignees', value: 'all' }, ...members.map((m: any) => ({ label: m.name, value: m.id }))]"
          value-key="value"
          class="min-w-[140px]"
          @update:model-value="updateAssignee($event === 'all' ? undefined : $event)"
        />
      </UFormField>

      <!-- Priority Filter -->
      <UFormField label="Priority">
        <USelectMenu
          :model-value="localFilters.priority || 'all'"
          :items="[{ label: 'All priorities', value: 'all' }, ...priorityOptions]"
          value-key="value"
          class="min-w-[120px]"
          @update:model-value="updatePriority($event === 'all' ? undefined : $event as TaskPriority)"
        />
      </UFormField>

      <!-- Tags Filter -->
      <div v-if="tags.length > 0" class="flex flex-col gap-1">
        <label class="text-xs text-muted">Tags</label>
        <div class="flex flex-wrap gap-1 max-w-[200px]">
          <button
            v-for="tag in tags.slice(0, 5)"
            :key="tag.id"
            class="px-2 py-1 text-xs rounded border transition-colors"
            :class="(localFilters.tags || []).includes(tag.id) ? 'bg-inverted text-inverted border-transparent' : 'border-default text-muted hover:border-muted'"
            :style="(localFilters.tags || []).includes(tag.id) ? {} : { borderColor: tag.color + '40', color: tag.color }"
            @click="updateTags((localFilters.tags || []).includes(tag.id) ? (localFilters.tags || []).filter(id => id !== tag.id) : [...(localFilters.tags || []), tag.id])"
          >
            #{{ tag.slug }}
          </button>
        </div>
      </div>

      <!-- Group By -->
      <UFormField v-if="groupOptions.length > 0" label="Group by">
        <USelectMenu
          :model-value="groupBy || 'none'"
          :items="[{ label: 'No grouping', value: 'none' }, ...groupOptions.map(o => ({ label: o.displayName, value: o.groupBy }))]"
          value-key="value"
          class="min-w-[140px]"
          @update:model-value="emit('update:groupBy', $event === 'none' ? undefined : $event)"
        />
      </UFormField>

      <!-- Sort Presets -->
      <UFormField v-if="presets.length > 0" label="Sort">
        <USelectMenu
          model-value="default"
          :items="[{ label: 'Default', value: 'default' }, ...presets.map(p => ({ label: p.name, value: p.id }))]"
          value-key="value"
          class="min-w-[140px]"
          @update:model-value="(val: string) => { const preset = presets.find(p => p.id === val); if (preset) applyPreset(preset) }"
        />
      </UFormField>

      <div class="flex-1" />

      <!-- Clear Filters -->
      <button
        v-if="hasActiveFilters"
        class="flex items-center gap-1.5 px-3 py-2 text-sm text-error hover:bg-error/5 rounded transition-colors"
        @click="clearFilters"
      >
        <UIcon name="i-lucide-x" class="w-4 h-4" />
        Clear all
      </button>
    </div>
  </div>
</template>
