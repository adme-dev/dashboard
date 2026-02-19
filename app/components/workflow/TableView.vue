<script setup lang="ts">
import type { Task, TaskStatus, KanbanFilters, TaskPriority, SortRule, GlobalTag } from '~/types'

const props = defineProps<{
  departmentId?: string
  projectId?: string
  filters?: KanbanFilters
  sortConfig?: SortRule[]
  groupBy?: string
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
  createTask: []
  sortChange: [sortConfig: SortRule[]]
}>()

const { user } = useAuth()
const toast = useToast()

// Bulk selection state
const selectedTaskIds = ref<Set<string>>(new Set())
const isAllSelected = computed(() => {
  if (tasks.value.length === 0) return false
  return tasks.value.every(task => selectedTaskIds.value.has(task.id))
})
const isSomeSelected = computed(() => {
  return selectedTaskIds.value.size > 0 && !isAllSelected.value
})
const selectedCount = computed(() => selectedTaskIds.value.size)

// Toggle single task selection
const toggleTaskSelection = (taskId: string, event: Event) => {
  event.stopPropagation()
  const newSet = new Set(selectedTaskIds.value)
  if (newSet.has(taskId)) {
    newSet.delete(taskId)
  } else {
    newSet.add(taskId)
  }
  selectedTaskIds.value = newSet
}

// Toggle all tasks selection
const toggleAllSelection = () => {
  if (isAllSelected.value) {
    selectedTaskIds.value = new Set()
  } else {
    selectedTaskIds.value = new Set(tasks.value.map(t => t.id))
  }
}

// Clear selection
const clearSelection = () => {
  selectedTaskIds.value = new Set()
}

// Bulk actions
const bulkActionLoading = ref(false)

const bulkUpdateStatus = async (statusId: string) => {
  if (selectedTaskIds.value.size === 0) return
  bulkActionLoading.value = true
  try {
    await $fetch('/api/agency/tasks/bulk', {
      method: 'PATCH',
      body: {
        taskIds: Array.from(selectedTaskIds.value),
        updates: { statusId }
      }
    })
    toast.add({ title: `Updated ${selectedTaskIds.value.size} tasks`, color: 'success' })
    clearSelection()
    refreshTasks()
  } catch (err: any) {
    toast.add({ title: 'Failed to update tasks', description: err.data?.message, color: 'error' })
  } finally {
    bulkActionLoading.value = false
  }
}

const bulkUpdatePriority = async (priority: TaskPriority) => {
  if (selectedTaskIds.value.size === 0) return
  bulkActionLoading.value = true
  try {
    await $fetch('/api/agency/tasks/bulk', {
      method: 'PATCH',
      body: {
        taskIds: Array.from(selectedTaskIds.value),
        updates: { priority }
      }
    })
    toast.add({ title: `Updated ${selectedTaskIds.value.size} tasks`, color: 'success' })
    clearSelection()
    refreshTasks()
  } catch (err: any) {
    toast.add({ title: 'Failed to update tasks', description: err.data?.message, color: 'error' })
  } finally {
    bulkActionLoading.value = false
  }
}

const bulkUpdateAssignee = async (assigneeId: string | null) => {
  if (selectedTaskIds.value.size === 0) return
  bulkActionLoading.value = true
  try {
    await $fetch('/api/agency/tasks/bulk', {
      method: 'PATCH',
      body: {
        taskIds: Array.from(selectedTaskIds.value),
        updates: { assigneeId }
      }
    })
    toast.add({ title: `Updated ${selectedTaskIds.value.size} tasks`, color: 'success' })
    clearSelection()
    refreshTasks()
  } catch (err: any) {
    toast.add({ title: 'Failed to update tasks', description: err.data?.message, color: 'error' })
  } finally {
    bulkActionLoading.value = false
  }
}

const bulkDelete = async () => {
  if (selectedTaskIds.value.size === 0) return
  if (!confirm(`Are you sure you want to delete ${selectedTaskIds.value.size} tasks? This cannot be undone.`)) return

  bulkActionLoading.value = true
  try {
    await $fetch('/api/agency/tasks/bulk', {
      method: 'DELETE',
      body: {
        taskIds: Array.from(selectedTaskIds.value)
      }
    })
    toast.add({ title: `Deleted ${selectedTaskIds.value.size} tasks`, color: 'success' })
    clearSelection()
    refreshTasks()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete tasks', description: err.data?.message, color: 'error' })
  } finally {
    bulkActionLoading.value = false
  }
}

// Fetch tasks
const { data: tasksData, pending: tasksPending, refresh: refreshTasks } = await useFetch('/api/agency/tasks', {
  query: computed(() => ({
    departmentId: props.departmentId,
    projectId: props.projectId,
    assigneeId: props.filters?.assigneeId,
    priority: props.filters?.priority,
    search: props.filters?.search,
    tags: props.filters?.tags?.join(','),
    includeCompleted: props.filters?.showCompleted ?? false,
    limit: 200
  }))
})

// Fetch statuses for status column
const { data: statusesData } = await useFetch('/api/agency/statuses', {
  query: computed(() => ({
    departmentId: props.departmentId
  }))
})

// Fetch pricing visibility
const { data: pricingVisibility } = await useFetch('/api/agency/pricing/visibility', {
  query: computed(() => ({
    departmentId: props.departmentId
  }))
})

// Fetch global tags
const { data: tagsData } = await useFetch('/api/agency/tags', {
  query: { limit: 100 }
})

// Fetch team members for bulk assign
const { data: membersData } = await useFetch('/api/agency/team-members', {
  query: computed(() => ({
    departmentId: props.departmentId,
    limit: 50
  }))
})

const tasks = computed(() => (tasksData.value?.tasks as Task[]) || [])
const statuses = computed(() => (statusesData.value as TaskStatus[]) || [])
const tags = computed(() => (tagsData.value as GlobalTag[]) || [])
const members = computed(() => (membersData.value?.members || []) as any[])
const canViewPricing = computed(() => {
  const data = pricingVisibility.value as { canViewPricing?: boolean; rules?: Record<string, unknown> } | null
  return data?.canViewPricing ?? false
})

// Current sort state
const currentSort = ref<SortRule[]>(props.sortConfig || [])

// Group tasks if groupBy is set
const groupedTasks = computed(() => {
  const taskList = tasks.value
  if (!props.groupBy || !taskList.length) {
    return [{ key: 'all', label: 'All Tasks', tasks: taskList }]
  }

  const groups: Record<string, { key: string; label: string; tasks: Task[] }> = {}

  for (const task of taskList) {
    let key: string
    let label: string

    switch (props.groupBy) {
      case 'status':
        key = task.statusId
        label = task.status?.name || 'No Status'
        break
      case 'assignee':
        key = task.assigneeId || 'unassigned'
        label = task.assignee?.name || 'Unassigned'
        break
      case 'priority':
        key = task.priority
        label = task.priority.charAt(0).toUpperCase() + task.priority.slice(1)
        break
      case 'project':
        key = task.projectId || 'no-project'
        label = task.project?.name || 'No Project'
        break
      default:
        key = 'all'
        label = 'All Tasks'
    }

    if (!groups[key]) {
      groups[key] = { key, label, tasks: [] }
    }
    groups[key]!.tasks.push(task)
  }

  return Object.values(groups)
})

// Table columns
const columns = computed(() => {
  const cols = [
    { key: 'title', label: 'Title', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'priority', label: 'Priority', sortable: true },
    { key: 'assignee', label: 'Assignee', sortable: true },
    { key: 'dueDate', label: 'Due Date', sortable: true },
    { key: 'tags', label: 'Tags', sortable: false }
  ]

  // Add pricing columns if user can view
  if (canViewPricing.value) {
    cols.push(
      { key: 'estimatedCost', label: 'Est. Cost', sortable: true },
      { key: 'actualCost', label: 'Actual Cost', sortable: true }
    )
  }

  return cols
})

const priorityColors: Record<TaskPriority, 'error' | 'warning' | 'info' | 'success' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  medium: 'info',
  low: 'success'
}

function handleSort(column: string) {
  const existingIndex = currentSort.value.findIndex(s => s.column === column)

  if (existingIndex >= 0) {
    const existing = currentSort.value[existingIndex]
    if (existing) {
      if (existing.direction === 'asc') {
        existing.direction = 'desc'
      } else {
        // Remove from sort
        currentSort.value.splice(existingIndex, 1)
      }
    }
  } else {
    // Add new sort column
    currentSort.value.push({ column, direction: 'asc' })
  }

  emit('sortChange', [...currentSort.value])
}

function getSortDirection(column: string): 'asc' | 'desc' | null {
  const sort = currentSort.value.find(s => s.column === column)
  return sort?.direction || null
}

function formatDate(dateString?: string) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatCurrency(amount?: number) {
  if (amount === undefined || amount === null) return '-'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

defineExpose({ refreshTasks })
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Bulk Action Toolbar (shown when tasks selected) -->
    <div
      v-if="selectedCount > 0"
      class="sticky top-0 z-20 bg-primary-50 dark:bg-primary-900/30 border-b border-primary-200 dark:border-primary-800 px-4 py-3"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <UCheckbox
            :checked="isAllSelected"
            :indeterminate="isSomeSelected"
            @change="toggleAllSelection"
          />
          <span class="font-medium text-primary-700 dark:text-primary-300">
            {{ selectedCount }} task{{ selectedCount !== 1 ? 's' : '' }} selected
          </span>
        </div>

        <div class="flex items-center gap-2">
          <!-- Bulk Status Change -->
          <UDropdownMenu>
            <UButton
              variant="outline"
              size="sm"
              icon="i-lucide-circle"
              :loading="bulkActionLoading"
            >
              Status
            </UButton>
            <template #content>
              <UDropdownMenuItem
                v-for="status in statuses"
                :key="status.id"
                @click="bulkUpdateStatus(status.id)"
              >
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full"
                    :style="{ backgroundColor: status.color }"
                  />
                  {{ status.name }}
                </div>
              </UDropdownMenuItem>
            </template>
          </UDropdownMenu>

          <!-- Bulk Priority Change -->
          <UDropdownMenu>
            <UButton
              variant="outline"
              size="sm"
              icon="i-lucide-flag"
              :loading="bulkActionLoading"
            >
              Priority
            </UButton>
            <template #content>
              <UDropdownMenuItem @click="bulkUpdatePriority('urgent')">
                <UBadge color="error" variant="subtle" size="sm">Urgent</UBadge>
              </UDropdownMenuItem>
              <UDropdownMenuItem @click="bulkUpdatePriority('high')">
                <UBadge color="warning" variant="subtle" size="sm">High</UBadge>
              </UDropdownMenuItem>
              <UDropdownMenuItem @click="bulkUpdatePriority('medium')">
                <UBadge color="info" variant="subtle" size="sm">Medium</UBadge>
              </UDropdownMenuItem>
              <UDropdownMenuItem @click="bulkUpdatePriority('low')">
                <UBadge color="success" variant="subtle" size="sm">Low</UBadge>
              </UDropdownMenuItem>
            </template>
          </UDropdownMenu>

          <!-- Bulk Assignee Change -->
          <UDropdownMenu>
            <UButton
              variant="outline"
              size="sm"
              icon="i-lucide-user"
              :loading="bulkActionLoading"
            >
              Assign
            </UButton>
            <template #content>
              <UDropdownMenuItem @click="bulkUpdateAssignee(null)">
                <span class="text-muted">Unassigned</span>
              </UDropdownMenuItem>
              <UDropdownMenuItem
                v-for="member in members"
                :key="member.id"
                @click="bulkUpdateAssignee(member.id)"
              >
                <div class="flex items-center gap-2">
                  <UAvatar :alt="member.name" size="xs" />
                  {{ member.name }}
                </div>
              </UDropdownMenuItem>
            </template>
          </UDropdownMenu>

          <USeparator orientation="vertical" class="h-6" />

          <!-- Delete -->
          <UButton
            variant="ghost"
            color="error"
            size="sm"
            icon="i-lucide-trash-2"
            :loading="bulkActionLoading"
            @click="bulkDelete"
          >
            Delete
          </UButton>

          <!-- Clear Selection -->
          <UButton
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            @click="clearSelection"
          >
            Clear
          </UButton>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <template v-if="tasksPending">
      <div class="p-4">
        <USkeleton class="h-10 w-full mb-2" />
        <USkeleton v-for="i in 5" :key="i" class="h-12 w-full mb-1" />
      </div>
    </template>

    <!-- Table -->
    <template v-else>
      <div class="flex-1 overflow-auto" role="region" aria-label="Task list">
        <!-- Grouped sections -->
        <div v-for="group in groupedTasks" :key="group.key" class="mb-6">
          <!-- Group header -->
          <div v-if="groupBy" class="sticky top-0 bg-default px-4 py-2 border-b border-default z-10">
            <h3 class="text-sm font-medium text-default" :id="`group-${group.key}`">
              {{ group.label }}
              <span class="text-muted ml-2">({{ group.tasks.length }})</span>
            </h3>
          </div>

          <!-- Table -->
          <table
            class="w-full text-sm"
            role="grid"
            :aria-label="groupBy ? `Tasks in ${group.label}` : 'All tasks'"
            :aria-describedby="groupBy ? `group-${group.key}` : undefined"
          >
            <thead class="bg-muted/50 sticky top-0">
              <tr>
                <!-- Checkbox Column -->
                <th scope="col" class="w-10 px-4 py-2">
                  <UCheckbox
                    :checked="isAllSelected"
                    :indeterminate="isSomeSelected"
                    @change="toggleAllSelection"
                    aria-label="Select all tasks"
                  />
                </th>
                <th
                  v-for="col in columns"
                  :key="col.key"
                  scope="col"
                  class="text-left px-4 py-2 font-medium text-muted cursor-pointer hover:bg-muted/70 transition-colors"
                  :class="{ 'cursor-pointer': col.sortable }"
                  :aria-sort="getSortDirection(col.key) === 'asc' ? 'ascending' : getSortDirection(col.key) === 'desc' ? 'descending' : undefined"
                  @click="col.sortable && handleSort(col.key)"
                  @keydown.enter="col.sortable && handleSort(col.key)"
                  @keydown.space.prevent="col.sortable && handleSort(col.key)"
                  :tabindex="col.sortable ? 0 : -1"
                  :role="col.sortable ? 'button' : undefined"
                >
                  <div class="flex items-center gap-1">
                    {{ col.label }}
                    <template v-if="col.sortable">
                      <UIcon
                        v-if="getSortDirection(col.key) === 'asc'"
                        name="i-lucide-arrow-up"
                        class="size-3"
                        aria-hidden="true"
                      />
                      <UIcon
                        v-else-if="getSortDirection(col.key) === 'desc'"
                        name="i-lucide-arrow-down"
                        class="size-3"
                        aria-hidden="true"
                      />
                      <UIcon
                        v-else
                        name="i-lucide-arrow-up-down"
                        class="size-3 opacity-30"
                        aria-hidden="true"
                      />
                      <span class="sr-only">
                        {{ getSortDirection(col.key) === 'asc' ? ', sorted ascending' : getSortDirection(col.key) === 'desc' ? ', sorted descending' : ', click to sort' }}
                      </span>
                    </template>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="task in group.tasks"
                :key="task.id"
                class="border-b border-default hover:bg-muted/30 cursor-pointer transition-colors"
                :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedTaskIds.has(task.id) }"
                tabindex="0"
                role="row"
                :aria-label="`${task.title}, ${task.priority} priority${task.assignee ? `, assigned to ${task.assignee.name}` : ''}${task.dueDate ? `, due ${formatDate(task.dueDate)}` : ''}`"
                @click="emit('taskClick', task)"
                @keydown.enter="emit('taskClick', task)"
                @keydown.space.prevent="emit('taskClick', task)"
              >
                <!-- Checkbox -->
                <td class="px-4 py-3" @click.stop>
                  <UCheckbox
                    :checked="selectedTaskIds.has(task.id)"
                    @change="toggleTaskSelection(task.id, $event)"
                    :aria-label="`Select ${task.title}`"
                  />
                </td>
                <!-- Title -->
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ task.title }}</span>
                    <UBadge v-if="task.isBlocked" color="error" variant="subtle" size="xs">
                      Blocked
                    </UBadge>
                  </div>
                  <div v-if="task.project" class="text-xs text-muted mt-0.5">
                    {{ task.project.name }}
                  </div>
                </td>

                <!-- Status -->
                <td class="px-4 py-3">
                  <UBadge
                    v-if="task.status"
                    :style="{ backgroundColor: task.status.color + '20', color: task.status.color }"
                    variant="subtle"
                    size="sm"
                  >
                    {{ task.status.name }}
                  </UBadge>
                </td>

                <!-- Priority -->
                <td class="px-4 py-3">
                  <UBadge
                    :color="priorityColors[task.priority]"
                    variant="subtle"
                    size="sm"
                  >
                    {{ task.priority }}
                  </UBadge>
                </td>

                <!-- Assignee -->
                <td class="px-4 py-3">
                  <div v-if="task.assignee" class="flex items-center gap-2">
                    <UAvatar
                      :alt="task.assignee.name"
                      size="xs"
                    />
                    <span class="text-sm">{{ task.assignee.name }}</span>
                  </div>
                  <span v-else class="text-muted">-</span>
                </td>

                <!-- Due Date -->
                <td class="px-4 py-3">
                  <span
                    :class="{
                      'text-red-500': isOverdue(task.dueDate) && !task.completedAt,
                      'text-muted': !task.dueDate
                    }"
                  >
                    {{ formatDate(task.dueDate) }}
                  </span>
                </td>

                <!-- Tags -->
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="label in task.labels?.slice(0, 3)"
                      :key="label.id"
                      :style="{ backgroundColor: label.color + '20', color: label.color }"
                      variant="subtle"
                      size="xs"
                    >
                      {{ label.name }}
                    </UBadge>
                    <span v-if="(task.labels?.length || 0) > 3" class="text-xs text-muted">
                      +{{ (task.labels?.length || 0) - 3 }}
                    </span>
                  </div>
                </td>

                <!-- Pricing columns (if visible) -->
                <template v-if="canViewPricing">
                  <td class="px-4 py-3 text-right">
                    {{ formatCurrency((task as any).estimatedCost) }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    {{ formatCurrency((task as any).actualCost) }}
                  </td>
                </template>
              </tr>
            </tbody>
          </table>

          <!-- Empty state for group -->
          <div v-if="group.tasks.length === 0" class="p-8 text-center text-muted">
            No tasks in this group
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="tasks.length === 0" class="flex-1 flex items-center justify-center p-8">
          <div class="text-center">
            <UIcon name="i-lucide-clipboard-list" class="h-12 w-12 text-muted mx-auto mb-3" />
            <p class="text-muted mb-4">No tasks found</p>
            <UButton @click="emit('createTask')">
              Create Task
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
