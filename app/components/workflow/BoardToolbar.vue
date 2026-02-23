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
const { data: membersData } = await useAsyncData(
  `toolbar-members-${props.departmentId}`,
  () => fetch(`/api/agency/departments/members?departmentId=${props.departmentId}`).then(r => r.json()) as Promise<{ members: any[] }>,
  { default: () => ({ members: [] }), watch: [() => props.departmentId] }
)

// Fetch tags for tag filter
const { data: tagsData } = await useAsyncData(
  'toolbar-tags',
  () => fetch('/api/agency/tags?limit=50').then(r => r.json()) as Promise<{ tags: any[] }>
)

// Fetch grouping options
const { data: groupingOptions } = await useAsyncData(
  `toolbar-grouping-${props.departmentId}`,
  () => fetch(`/api/agency/grouping/options?departmentId=${props.departmentId}`).then(r => r.json()) as Promise<{ options: any[] }>,
  { watch: [() => props.departmentId] }
)

// Fetch sorting presets
const { data: sortingPresets } = await useAsyncData(
  `toolbar-sorting-${props.departmentId}`,
  () => fetch(`/api/agency/sorting/presets?departmentId=${props.departmentId}`).then(r => r.json()) as Promise<any[]>,
  { watch: [() => props.departmentId] }
)

const members = computed(() => membersData.value?.members || [])
const tags = computed(() => (tagsData.value?.tags as GlobalTag[]) || [])
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
      <div class="flex items-center border border-black/20 rounded overflow-hidden">
        <button
          v-for="view in viewOptions"
          :key="view.value"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
          :class="currentView === view.value ? 'bg-black text-white' : 'text-black/60 hover:text-black hover:bg-black/5'"
          @click="emit('update:currentView', view.value as BoardViewType)"
        >
          <UIcon :name="view.icon" class="w-4 h-4" />
          <span class="hidden sm:inline">{{ view.label }}</span>
        </button>
      </div>

      <div class="w-px h-6 bg-black/10" />

      <!-- Search -->
      <div class="relative">
        <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
        <input
          :value="localFilters.search"
          type="text"
          placeholder="Search tasks..."
          class="pl-9 pr-4 py-2 border border-black/20 rounded text-sm focus:outline-none focus:border-[#13B5EA] w-48"
          @input="updateSearch(($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Toggle Filters -->
      <button
        class="flex items-center gap-2 px-3 py-2 border border-black/20 rounded text-sm font-medium transition-colors"
        :class="showFilters ? 'bg-black text-white' : 'text-black/60 hover:text-black hover:bg-black/5'"
        @click="showFilters = !showFilters"
      >
        <UIcon name="i-lucide-filter" class="w-4 h-4" />
        <span>Filters</span>
        <span
          v-if="activeFiltersCount > 0"
          class="ml-1 px-1.5 py-0.5 text-xs rounded"
          :class="showFilters ? 'bg-white text-black' : 'bg-[#13B5EA] text-white'"
        >
          {{ activeFiltersCount }}
        </span>
      </button>

      <div class="flex-1" />

      <!-- Show Completed Toggle -->
      <button
        class="flex items-center gap-2 px-3 py-2 border rounded text-sm font-medium transition-colors"
        :class="localFilters.showCompleted ? 'bg-[#7DD3A8] border-[#7DD3A8] text-white' : 'border-black/20 text-black/60 hover:text-black'"
        @click="toggleShowCompleted"
      >
        <UIcon :name="localFilters.showCompleted ? 'i-lucide-check-circle' : 'i-lucide-circle'" class="w-4 h-4" />
        <span class="hidden sm:inline">Completed</span>
      </button>

      <!-- Save View -->
      <button
        class="flex items-center gap-2 px-3 py-2 border border-black/20 rounded text-sm font-medium text-black/60 hover:text-black hover:bg-black/5 transition-colors"
        @click="emit('saveView')"
      >
        <UIcon name="i-lucide-save" class="w-4 h-4" />
        <span class="hidden sm:inline">Save</span>
      </button>
    </div>

    <!-- Expanded Filters -->
    <div v-if="showFilters" class="flex items-center gap-3 flex-wrap p-4 border border-black/10 rounded-lg bg-[#FAFAFA]">
      <!-- Assignee Filter -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-black/50">Assignee</label>
        <select
          :value="localFilters.assigneeId || ''"
          class="px-3 py-2 border border-black/20 rounded text-sm bg-white focus:outline-none focus:border-[#13B5EA] min-w-[140px]"
          @change="updateAssignee(($event.target as HTMLSelectElement).value || undefined)"
        >
          <option value="">All assignees</option>
          <option v-for="member in members" :key="member.id" :value="member.id">
            {{ member.name }}
          </option>
        </select>
      </div>

      <!-- Priority Filter -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-black/50">Priority</label>
        <select
          :value="localFilters.priority || ''"
          class="px-3 py-2 border border-black/20 rounded text-sm bg-white focus:outline-none focus:border-[#13B5EA] min-w-[120px]"
          @change="updatePriority(($event.target as HTMLSelectElement).value as TaskPriority || undefined)"
        >
          <option value="">All priorities</option>
          <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <!-- Tags Filter -->
      <div v-if="tags.length > 0" class="flex flex-col gap-1">
        <label class="text-xs text-black/50">Tags</label>
        <div class="flex flex-wrap gap-1 max-w-[200px]">
          <button
            v-for="tag in tags.slice(0, 5)"
            :key="tag.id"
            class="px-2 py-1 text-xs rounded border transition-colors"
            :class="(localFilters.tags || []).includes(tag.id) ? 'border-black bg-black text-white' : 'border-black/20 text-black/60 hover:border-black'"
            :style="(localFilters.tags || []).includes(tag.id) ? {} : { borderColor: tag.color + '40', color: tag.color }"
            @click="updateTags((localFilters.tags || []).includes(tag.id) ? (localFilters.tags || []).filter(id => id !== tag.id) : [...(localFilters.tags || []), tag.id])"
          >
            #{{ tag.slug }}
          </button>
        </div>
      </div>

      <!-- Group By -->
      <div v-if="groupOptions.length > 0" class="flex flex-col gap-1">
        <label class="text-xs text-black/50">Group by</label>
        <select
          :value="groupBy || ''"
          class="px-3 py-2 border border-black/20 rounded text-sm bg-white focus:outline-none focus:border-[#13B5EA] min-w-[140px]"
          @change="emit('update:groupBy', ($event.target as HTMLSelectElement).value || undefined)"
        >
          <option value="">No grouping</option>
          <option v-for="option in groupOptions" :key="option.groupBy" :value="option.groupBy">
            {{ option.displayName }}
          </option>
        </select>
      </div>

      <!-- Sort Presets -->
      <div v-if="presets.length > 0" class="flex flex-col gap-1">
        <label class="text-xs text-black/50">Sort</label>
        <select
          class="px-3 py-2 border border-black/20 rounded text-sm bg-white focus:outline-none focus:border-[#13B5EA] min-w-[140px]"
          @change="applyPreset(presets.find(p => p.id === ($event.target as HTMLSelectElement).value)!)"
        >
          <option value="">Default</option>
          <option v-for="preset in presets" :key="preset.id" :value="preset.id">
            {{ preset.name }}
          </option>
        </select>
      </div>

      <div class="flex-1" />

      <!-- Clear Filters -->
      <button
        v-if="hasActiveFilters"
        class="flex items-center gap-1.5 px-3 py-2 text-sm text-[#FF6B6B] hover:bg-[#FF6B6B]/5 rounded transition-colors"
        @click="clearFilters"
      >
        <UIcon name="i-lucide-x" class="w-4 h-4" />
        Clear all
      </button>
    </div>
  </div>
</template>
