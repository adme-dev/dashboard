<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Tasks</h1>
        <p class="text-gray-500">Manage and track all tasks across projects</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          icon="i-heroicons-funnel"
          @click="showFilters = !showFilters"
        >
          Filters
          <UBadge v-if="activeFilterCount > 0" color="primary" size="xs" class="ml-1">
            {{ activeFilterCount }}
          </UBadge>
        </UButton>
        <UButton
          color="primary"
          icon="i-heroicons-plus"
          @click="showCreateModal = true"
        >
          New Task
        </UButton>
      </div>
    </div>

    <!-- Filters Panel -->
    <UCard v-if="showFilters">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <UFormField label="Search">
          <UInput
            v-model="filters.search"
            placeholder="Search tasks..."
            icon="i-heroicons-magnifying-glass"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Project">
          <USelectMenu
            v-model="filters.projectId"
            :items="projectOptions"
            value-key="value"
            placeholder="All projects"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Department">
          <USelectMenu
            v-model="filters.departmentId"
            :items="departmentOptions"
            value-key="value"
            placeholder="All departments"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Assignee">
          <USelectMenu
            v-model="filters.assigneeId"
            :items="memberOptions"
            value-key="value"
            placeholder="All assignees"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Priority">
          <USelectMenu
            v-model="filters.priority"
            :items="priorityOptions"
            value-key="value"
            placeholder="All priorities"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Status">
          <USelectMenu
            v-model="filters.statusId"
            :items="statusOptions"
            value-key="value"
            placeholder="All statuses"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="flex items-center gap-4 mt-4 pt-4 border-t">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="filters.excludeCompleted" class="rounded" />
          Hide completed
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="filters.overdue" class="rounded" />
          Overdue only
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="filters.isBlocked" class="rounded" />
          Blocked only
        </label>
        <div class="flex-1" />
        <UButton variant="ghost" size="sm" @click="clearFilters">
          Clear filters
        </UButton>
      </div>
    </UCard>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-primary-50 rounded-lg">
            <UIcon name="i-heroicons-clipboard-document-list" class="w-5 h-5 text-primary-500" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ pagination?.total || 0 }}</p>
            <p class="text-sm text-gray-500">Total Tasks</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-warning-50 rounded-lg">
            <UIcon name="i-heroicons-clock" class="w-5 h-5 text-warning-500" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ overdueCount }}</p>
            <p class="text-sm text-gray-500">Overdue</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-info-50 rounded-lg">
            <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-info-500" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ inProgressCount }}</p>
            <p class="text-sm text-gray-500">In Progress</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-error-50 rounded-lg">
            <UIcon name="i-heroicons-no-symbol" class="w-5 h-5 text-error-500" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ blockedCount }}</p>
            <p class="text-sm text-gray-500">Blocked</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Tasks Table -->
    <UCard>
      <div v-if="pending" class="flex justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
      </div>

      <div v-else-if="!tasks?.length" class="text-center py-12">
        <UIcon name="i-heroicons-clipboard-document-list" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">No tasks found</p>
        <p class="text-sm text-gray-400">Try adjusting your filters or create a new task</p>
      </div>

      <UTable v-else :data="tasks" :columns="columns">
        <template #task-cell="{ row }">
          <div class="flex items-center gap-3">
            <div
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: (row as any).status?.color || '#9ca3af' }"
            />
            <div>
              <NuxtLink
                :to="`/agency/tasks/${(row as any).id}`"
                class="font-medium hover:text-primary-500"
              >
                {{ (row as any).title }}
              </NuxtLink>
              <div class="flex items-center gap-2 mt-0.5">
                <span v-if="(row as any).project" class="text-xs text-gray-400">
                  {{ (row as any).project.name }}
                </span>
                <UBadge
                  v-for="label in ((row as any).labels || []).slice(0, 2)"
                  :key="label.id"
                  size="xs"
                  variant="subtle"
                  :style="{ backgroundColor: label.color + '20', color: label.color }"
                >
                  {{ label.name }}
                </UBadge>
              </div>
            </div>
          </div>
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :style="{ backgroundColor: (row as any).status?.color + '20', color: (row as any).status?.color }"
            size="sm"
          >
            {{ (row as any).status?.name }}
          </UBadge>
        </template>

        <template #priority-cell="{ row }">
          <UBadge :color="getPriorityColor((row as any).priority)" size="sm">
            {{ (row as any).priority }}
          </UBadge>
        </template>

        <template #assignee-cell="{ row }">
          <div v-if="(row as any).assignee" class="flex items-center gap-2">
            <UAvatar :alt="(row as any).assignee.name" size="xs" />
            <span class="text-sm">{{ (row as any).assignee.name }}</span>
          </div>
          <span v-else class="text-gray-400 text-sm">Unassigned</span>
        </template>

        <template #dueDate-cell="{ row }">
          <div v-if="(row as any).dueDate" class="flex items-center gap-1">
            <UIcon
              v-if="isOverdue((row as any).dueDate, (row as any).status?.isFinal)"
              name="i-heroicons-exclamation-triangle"
              class="w-4 h-4 text-error-500"
            />
            <span :class="isOverdue((row as any).dueDate, (row as any).status?.isFinal) ? 'text-error-500' : ''">
              {{ formatDate((row as any).dueDate) }}
            </span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #progress-cell="{ row }">
          <div v-if="(row as any).subtaskCount > 0" class="flex items-center gap-2">
            <UProgress
              :value="((row as any).completedSubtasks / (row as any).subtaskCount) * 100"
              size="sm"
              class="w-16"
            />
            <span class="text-xs text-gray-500">
              {{ (row as any).completedSubtasks }}/{{ (row as any).subtaskCount }}
            </span>
          </div>
          <span v-else class="text-gray-400 text-sm">-</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center gap-1">
            <UButton
              icon="i-heroicons-eye"
              variant="ghost"
              size="xs"
              :to="`/agency/tasks/${(row as any).id}`"
            />
            <UButton
              icon="i-heroicons-pencil"
              variant="ghost"
              size="xs"
              @click="editTask(row as any)"
            />
          </div>
        </template>
      </UTable>

      <!-- Pagination -->
      <div v-if="pagination && pagination.total > pagination.limit" class="flex items-center justify-between mt-4 pt-4 border-t">
        <p class="text-sm text-gray-500">
          Showing {{ pagination.offset + 1 }} to {{ Math.min(pagination.offset + pagination.limit, pagination.total) }}
          of {{ pagination.total }} tasks
        </p>
        <div class="flex items-center gap-2">
          <UButton
            variant="outline"
            size="sm"
            :disabled="pagination.offset === 0"
            @click="prevPage"
          >
            Previous
          </UButton>
          <UButton
            variant="outline"
            size="sm"
            :disabled="!pagination.hasMore"
            @click="nextPage"
          >
            Next
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Create Task Modal -->
    <UModal v-model:open="showCreateModal" class="max-w-2xl">
      <template #header>
        <h3 class="font-semibold">{{ editingTask ? 'Edit Task' : 'Create Task' }}</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <UFormField label="Title" required>
            <UInput v-model="taskForm.title" placeholder="Task title" class="w-full" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea
              v-model="taskForm.description"
              placeholder="Task description..."
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Project">
              <USelectMenu
                v-model="taskForm.projectId"
                :items="projectOptions"
                value-key="value"
                placeholder="Select project"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Department" required>
              <USelectMenu
                v-model="taskForm.departmentId"
                :items="departmentOptions"
                value-key="value"
                placeholder="Select department"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Assignee">
              <USelectMenu
                v-model="taskForm.assigneeId"
                :items="memberOptions"
                value-key="value"
                placeholder="Select assignee"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Priority">
              <USelectMenu
                v-model="taskForm.priority"
                :items="priorityOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Due Date">
              <UInput v-model="taskForm.dueDate" type="date" class="w-full" />
            </UFormField>

            <UFormField label="Estimated Hours">
              <UInput v-model.number="taskForm.estimatedHours" type="number" min="0" step="0.5" class="w-full" />
            </UFormField>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="closeModal">Cancel</UButton>
          <UButton
            color="primary"
            :loading="saving"
            :disabled="!taskForm.title || !taskForm.departmentId"
            @click="saveTask"
          >
            {{ editingTask ? 'Update' : 'Create' }} Task
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const toast = useToast()

interface Task {
  id: string
  title: string
  description: string | null
  projectId: string | null
  departmentId: string
  statusId: string
  assigneeId: string | null
  priority: string
  dueDate: string | null
  estimatedHours: number | null
  isBlocked: boolean
  status: {
    id: string
    name: string
    color: string
    category: string
    isFinal: boolean
  }
  department: {
    id: string
    name: string
    color: string
  }
  project: {
    id: string
    name: string
  } | null
  assignee: {
    id: string
    name: string
    email: string
  } | null
  labels: Array<{ id: string; name: string; color: string }>
  subtaskCount: number
  completedSubtasks: number
  commentCount: number
}

// Filters
const showFilters = ref(false)
const filters = ref({
  search: '',
  projectId: null as string | null,
  departmentId: null as string | null,
  assigneeId: null as string | null,
  statusId: null as string | null,
  priority: null as string | null,
  excludeCompleted: false,
  overdue: false,
  isBlocked: false
})

const currentPage = ref(0)
const limit = 25

const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.search) count++
  if (filters.value.projectId) count++
  if (filters.value.departmentId) count++
  if (filters.value.assigneeId) count++
  if (filters.value.statusId) count++
  if (filters.value.priority) count++
  if (filters.value.excludeCompleted) count++
  if (filters.value.overdue) count++
  if (filters.value.isBlocked) count++
  return count
})

const clearFilters = () => {
  filters.value = {
    search: '',
    projectId: null,
    departmentId: null,
    assigneeId: null,
    statusId: null,
    priority: null,
    excludeCompleted: false,
    overdue: false,
    isBlocked: false
  }
  currentPage.value = 0
}

// API Query
const apiQuery = computed(() => {
  const q: Record<string, any> = {
    limit,
    offset: currentPage.value * limit
  }
  if (filters.value.search) q.search = filters.value.search
  if (filters.value.projectId) q.projectId = filters.value.projectId
  if (filters.value.departmentId) q.departmentId = filters.value.departmentId
  if (filters.value.assigneeId) q.assigneeId = filters.value.assigneeId
  if (filters.value.statusId) q.statusId = filters.value.statusId
  if (filters.value.priority) q.priority = filters.value.priority
  if (filters.value.excludeCompleted) q.excludeCompleted = 'true'
  if (filters.value.overdue) q.overdue = 'true'
  if (filters.value.isBlocked) q.isBlocked = 'true'
  return q
})

// Fetch data
const { data, pending, refresh } = await useFetch<{
  tasks: Task[]
  pagination: { total: number; limit: number; offset: number; hasMore: boolean }
}>('/api/agency/tasks', { query: apiQuery })

const tasks = computed(() => data.value?.tasks || [])
const pagination = computed(() => data.value?.pagination)

// Stats
const overdueCount = computed(() => {
  const today = new Date().toISOString().split('T')[0] ?? ''
  return tasks.value.filter(t => t.dueDate && t.dueDate < today && !t.status.isFinal).length
})

const inProgressCount = computed(() => {
  return tasks.value.filter(t => t.status.category === 'in_progress').length
})

const blockedCount = computed(() => {
  return tasks.value.filter(t => t.isBlocked).length
})

// Fetch related data for filters
const { data: projectsData } = await useFetch<{ projects: Array<{ id: string; name: string }> }>('/api/agency/projects')
const { data: departmentsData } = await useFetch<Array<{ id: string; name: string }>>('/api/agency/departments')
const { data: membersData } = await useFetch<{ members: Array<{ id: string; name: string }> }>('/api/agency/team-members')
const { data: statusesData } = await useFetch<Array<{ id: string; name: string }>>('/api/agency/statuses')

const projectOptions = computed(() => [
  { label: 'All projects', value: null },
  ...(projectsData.value?.projects || []).map(p => ({ label: p.name, value: p.id }))
])

const departmentOptions = computed(() => [
  { label: 'All departments', value: null },
  ...(departmentsData.value || []).map(d => ({ label: d.name, value: d.id }))
])

const memberOptions = computed(() => [
  { label: 'All assignees', value: null },
  ...(membersData.value?.members || []).map(m => ({ label: m.name, value: m.id }))
])

const statusOptions = computed(() => [
  { label: 'All statuses', value: null },
  ...(statusesData.value || []).map(s => ({ label: s.name, value: s.id }))
])

const priorityOptions = [
  { label: 'All priorities', value: null },
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
]

// Table columns
const columns = [
  { accessorKey: 'task', header: 'Task' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'priority', header: 'Priority' },
  { accessorKey: 'assignee', header: 'Assignee' },
  { accessorKey: 'dueDate', header: 'Due Date' },
  { accessorKey: 'progress', header: 'Progress' },
  { accessorKey: 'actions', header: '' }
]

// Pagination
const prevPage = () => {
  if (currentPage.value > 0) {
    currentPage.value--
  }
}

const nextPage = () => {
  if (pagination.value?.hasMore) {
    currentPage.value++
  }
}

// Create/Edit Modal
const showCreateModal = ref(false)
const editingTask = ref<Task | null>(null)
const saving = ref(false)

const taskForm = ref({
  title: '',
  description: '',
  projectId: null as string | null,
  departmentId: '',
  assigneeId: null as string | null,
  priority: 'medium',
  dueDate: '',
  estimatedHours: null as number | null
})

const editTask = (task: Task) => {
  editingTask.value = task
  taskForm.value = {
    title: task.title,
    description: task.description || '',
    projectId: task.projectId,
    departmentId: task.departmentId,
    assigneeId: task.assigneeId,
    priority: task.priority,
    dueDate: task.dueDate ? (task.dueDate.split('T')[0] ?? '') : '',
    estimatedHours: task.estimatedHours
  }
  showCreateModal.value = true
}

const closeModal = () => {
  showCreateModal.value = false
  editingTask.value = null
  taskForm.value = {
    title: '',
    description: '',
    projectId: null,
    departmentId: '',
    assigneeId: null,
    priority: 'medium',
    dueDate: '',
    estimatedHours: null
  }
}

const saveTask = async () => {
  if (!taskForm.value.title || !taskForm.value.departmentId) return

  saving.value = true
  try {
    if (editingTask.value) {
      await $fetch(`/api/agency/tasks/${editingTask.value.id}`, {
        method: 'PUT',
        body: {
          title: taskForm.value.title,
          description: taskForm.value.description || null,
          projectId: taskForm.value.projectId,
          departmentId: taskForm.value.departmentId,
          assigneeId: taskForm.value.assigneeId,
          priority: taskForm.value.priority,
          dueDate: taskForm.value.dueDate || null,
          estimatedHours: taskForm.value.estimatedHours
        }
      })
      toast.add({ title: 'Task updated', color: 'success' })
    } else {
      await $fetch('/api/agency/tasks', {
        method: 'POST',
        body: {
          title: taskForm.value.title,
          description: taskForm.value.description || null,
          projectId: taskForm.value.projectId,
          departmentId: taskForm.value.departmentId,
          assigneeId: taskForm.value.assigneeId,
          priority: taskForm.value.priority,
          dueDate: taskForm.value.dueDate || null,
          estimatedHours: taskForm.value.estimatedHours
        }
      })
      toast.add({ title: 'Task created', color: 'success' })
    }
    closeModal()
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to save task',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// Helpers
const getPriorityColor = (priority: string): 'error' | 'warning' | 'info' | 'neutral' => {
  const colors: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
    urgent: 'error',
    high: 'warning',
    medium: 'info',
    low: 'neutral'
  }
  return colors[priority] || 'neutral'
}

const isOverdue = (dueDate: string, isFinal: boolean): boolean => {
  if (isFinal) return false
  const today = new Date().toISOString().split('T')[0] ?? ''
  return dueDate < today
}

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}
</script>
