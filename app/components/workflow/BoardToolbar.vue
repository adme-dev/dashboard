<script setup lang="ts">
import type { BoardViewType, KanbanFilters, SortRule, TaskPriority, GlobalTag, BoardGroupingOption, SortingPreset, DepartmentMember } from '~/types'

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

// Priority options
const priorityOptions = [
  { value: 'urgent', label: 'Urgent', color: 'red' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'low', label: 'Low', color: 'green' }
]

// Watch for external filter changes
watch(() => props.filters, (newFilters) => {
  localFilters.value = { ...newFilters }
}, { deep: true })

// Update filters with debounce for search
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
</script>

<template>
  <div class="flex items-center gap-3 flex-wrap">
    <!-- View Switcher -->
    <WorkflowBoardViewSwitcher
      :model-value="currentView"
      :available-views="['kanban', 'table', 'timeline', 'calendar']"
      @update:model-value="emit('update:currentView', $event)"
    />

    <USeparator orientation="vertical" class="h-6" />

    <!-- Search -->
    <UInput
      :model-value="localFilters.search"
      placeholder="Search tasks..."
      icon="i-lucide-search"
      size="sm"
      class="w-48"
      @update:model-value="updateSearch($event as string)"
    />

    <!-- Assignee Filter -->
    <USelectMenu
      :model-value="localFilters.assigneeId"
      :items="[{ value: '', label: 'All assignees' }, ...members.map((m: any) => ({ value: m.id, label: m.name }))]"
      value-key="value"
      placeholder="Assignee"
      size="sm"
      class="w-40"
      @update:model-value="updateAssignee($event || undefined)"
    />

    <!-- Priority Filter -->
    <USelectMenu
      :model-value="localFilters.priority"
      :items="[{ value: '', label: 'All priorities' }, ...priorityOptions]"
      value-key="value"
      placeholder="Priority"
      size="sm"
      class="w-36"
      @update:model-value="updatePriority($event as TaskPriority || undefined)"
    />

    <!-- Tags Filter -->
    <USelectMenu
      v-if="tags.length > 0"
      :model-value="localFilters.tags || []"
      :items="tags.map(t => ({ value: t.id, label: '#' + t.slug, color: t.color }))"
      value-key="value"
      placeholder="Tags"
      multiple
      size="sm"
      class="w-36"
      @update:model-value="updateTags($event as string[])"
    />

    <!-- Group By -->
    <USelectMenu
      v-if="groupOptions.length > 0"
      :model-value="groupBy || ''"
      :items="[{ value: '', label: 'No grouping' }, ...groupOptions.map(g => ({ value: g.groupBy, label: g.displayName }))]"
      value-key="value"
      placeholder="Group by"
      size="sm"
      class="w-36"
      @update:model-value="emit('update:groupBy', $event || undefined)"
    />

    <!-- Sort Presets -->
    <UDropdownMenu v-if="presets.length > 0">
      <UButton
        icon="i-lucide-arrow-up-down"
        variant="ghost"
        size="sm"
      >
        Sort
      </UButton>
      <template #content>
        <UDropdownMenuGroup>
          <UDropdownMenuItem
            v-for="preset in presets"
            :key="preset.id"
            @click="applyPreset(preset)"
          >
            {{ preset.name }}
          </UDropdownMenuItem>
        </UDropdownMenuGroup>
      </template>
    </UDropdownMenu>

    <USeparator orientation="vertical" class="h-6" />

    <!-- Show Completed Toggle -->
    <UButton
      :icon="localFilters.showCompleted ? 'i-lucide-check-circle' : 'i-lucide-circle'"
      :variant="localFilters.showCompleted ? 'solid' : 'ghost'"
      :color="localFilters.showCompleted ? 'primary' : 'neutral'"
      size="sm"
      @click="toggleShowCompleted"
    >
      Completed
    </UButton>

    <!-- Clear Filters -->
    <UButton
      v-if="hasActiveFilters"
      icon="i-lucide-x"
      variant="ghost"
      color="error"
      size="sm"
      @click="clearFilters"
    >
      Clear
    </UButton>

    <!-- Save View -->
    <UButton
      icon="i-lucide-save"
      variant="ghost"
      size="sm"
      @click="emit('saveView')"
    >
      Save View
    </UButton>
  </div>
</template>
