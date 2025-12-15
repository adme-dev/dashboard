<script setup lang="ts">
import type { KanbanFilters, TaskPriority, TaskLabel } from '~/types'

const props = defineProps<{
  filters: KanbanFilters
  departmentId?: string
  showProjectFilter?: boolean
}>()

const emit = defineEmits<{
  'update:filters': [filters: KanbanFilters]
}>()

// Fetch team members for assignee filter
const { data: membersData } = await useFetch('/api/agency/departments/members', {
  query: computed(() => ({
    departmentId: props.departmentId
  }))
})

const members = computed(() => {
  const response = membersData.value as { members?: any[] } | undefined
  const data = response?.members || []
  return data.map(m => ({
    label: m.name,
    value: m.id,
    avatar: { alt: m.name }
  }))
})

// Fetch labels for label filter
const { data: labelsData } = await useFetch('/api/agency/labels', {
  query: computed(() => ({
    departmentId: props.departmentId
  }))
})

const labels = computed(() => {
  const data = labelsData.value as TaskLabel[]
  return data?.map(l => ({
    label: l.name,
    value: l.id,
    color: l.color
  })) || []
})

// Fetch projects for project filter
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { status: 'active', limit: 50 }
})

const projects = computed(() => {
  const response = projectsData.value as { projects?: any[] } | undefined
  const data = response?.projects || []
  return data.map(p => ({
    label: p.name,
    value: p.id
  }))
})

// Priority options
const priorityOptions: { label: string; value: TaskPriority; icon: string; color: string }[] = [
  { label: 'Urgent', value: 'urgent', icon: 'i-lucide-alert-circle', color: 'text-red-500' },
  { label: 'High', value: 'high', icon: 'i-lucide-arrow-up', color: 'text-orange-500' },
  { label: 'Medium', value: 'medium', icon: 'i-lucide-minus', color: 'text-yellow-500' },
  { label: 'Low', value: 'low', icon: 'i-lucide-arrow-down', color: 'text-blue-500' }
]

// Local filter state
const localFilters = reactive<KanbanFilters>({
  assigneeId: props.filters.assigneeId,
  priority: props.filters.priority,
  labels: props.filters.labels || [],
  search: props.filters.search || '',
  showCompleted: props.filters.showCompleted ?? false,
  projectId: props.filters.projectId
})

// Debounced search
const debouncedSearch = refDebounced(toRef(localFilters, 'search'), 300)

// Watch for changes and emit
watch([
  () => localFilters.assigneeId,
  () => localFilters.priority,
  () => localFilters.labels,
  debouncedSearch,
  () => localFilters.showCompleted,
  () => localFilters.projectId
], () => {
  emit('update:filters', {
    ...localFilters,
    search: debouncedSearch.value
  })
}, { deep: true })

// Sync with props
watch(() => props.filters, (newFilters) => {
  Object.assign(localFilters, newFilters)
}, { deep: true })

// Active filter count
const activeFilterCount = computed(() => {
  let count = 0
  if (localFilters.assigneeId) count++
  if (localFilters.priority) count++
  if (localFilters.labels?.length) count++
  if (localFilters.search) count++
  if (localFilters.projectId) count++
  return count
})

// Clear all filters
const clearFilters = () => {
  localFilters.assigneeId = undefined
  localFilters.priority = undefined
  localFilters.labels = []
  localFilters.search = ''
  localFilters.showCompleted = false
  localFilters.projectId = undefined
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
    <!-- Search -->
    <UInput
      v-model="localFilters.search"
      placeholder="Search tasks..."
      icon="i-lucide-search"
      class="w-64"
    />

    <!-- Divider -->
    <div class="h-6 w-px bg-neutral-300 dark:bg-neutral-600" />

    <!-- Assignee Filter -->
    <USelectMenu
      v-model="localFilters.assigneeId"
      :options="[{ label: 'All assignees', value: undefined }, ...members]"
      placeholder="Assignee"
      option-attribute="label"
      value-attribute="value"
      class="w-40"
    >
      <template #leading>
        <UIcon name="i-lucide-user" class="h-4 w-4 text-muted" />
      </template>
    </USelectMenu>

    <!-- Priority Filter -->
    <USelectMenu
      v-model="localFilters.priority"
      :options="[{ label: 'All priorities', value: undefined }, ...priorityOptions]"
      placeholder="Priority"
      option-attribute="label"
      value-attribute="value"
      class="w-36"
    >
      <template #leading>
        <UIcon
          v-if="localFilters.priority"
          :name="priorityOptions.find(p => p.value === localFilters.priority)?.icon || 'i-lucide-flag'"
          :class="priorityOptions.find(p => p.value === localFilters.priority)?.color"
          class="h-4 w-4"
        />
        <UIcon v-else name="i-lucide-flag" class="h-4 w-4 text-muted" />
      </template>
    </USelectMenu>

    <!-- Labels Filter -->
    <USelectMenu
      v-model="localFilters.labels"
      :items="labels"
      placeholder="Labels"
      multiple
      class="w-36"
      value-key="value"
    />

    <!-- Project Filter (optional) -->
    <USelectMenu
      v-if="showProjectFilter"
      v-model="localFilters.projectId"
      :options="[{ label: 'All projects', value: undefined }, ...projects]"
      placeholder="Project"
      option-attribute="label"
      value-attribute="value"
      class="w-40"
    >
      <template #leading>
        <UIcon name="i-lucide-folder" class="h-4 w-4 text-muted" />
      </template>
    </USelectMenu>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Show Completed Toggle -->
    <UCheckbox
      v-model="localFilters.showCompleted"
      label="Show completed"
    />

    <!-- Clear Filters -->
    <UButton
      v-if="activeFilterCount > 0"
      :label="`Clear (${activeFilterCount})`"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="clearFilters"
    />
  </div>
</template>
