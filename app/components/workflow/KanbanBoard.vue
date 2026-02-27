<script setup lang="ts">
import type { Task, TaskStatus, KanbanFilters, TaskPriority, TaskLabel } from '~/types'

const props = defineProps<{
  departmentId?: string
  workspaceId?: string
  projectId?: string
  filters?: KanbanFilters
  selectedTaskId?: string | null
  availableLabels?: TaskLabel[]
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
  taskMove: [taskId: string, newStatusId: string, newOrder: number]
  createTask: [statusId: string]
  taskEdit: [task: Task]
  taskDelete: [task: Task]
  taskLabelsUpdate: [taskId: string, labelIds: string[]]
  refreshLabels: []  // New event to tell parent to refresh labels
}>()

// Fetch statuses for this department/workspace
const { data: statusesData, pending: statusesPending } = useLazyFetch('/api/agency/statuses', {
  query: computed(() => ({
    departmentId: props.departmentId,
    workspaceId: !props.departmentId ? props.workspaceId : undefined
  }))
})

// Fetch tasks
const { data: tasksData, pending: tasksPending, refresh: refreshTasks } = useLazyFetch('/api/agency/tasks', {
  query: computed(() => ({
    departmentId: props.departmentId,
    workspaceId: !props.departmentId ? props.workspaceId : undefined,
    projectId: props.projectId,
    assigneeId: props.filters?.assigneeId,
    priority: props.filters?.priority,
    search: props.filters?.search,
    includeCompleted: props.filters?.showCompleted ?? false,
    limit: 200
  }))
})

const loading = computed(() => statusesPending.value || tasksPending.value)

// Find the done status for mobile swipe-to-complete action
const doneStatusId = computed(() => {
  const statuses = (statusesData.value as TaskStatus[]) || []
  const doneStatus = statuses.find(s => s.category === 'done')
  return doneStatus?.id
})

// Group tasks by status — deduplicate same-named statuses in "All Tasks" mode
const columns = computed(() => {
  const statuses = (statusesData.value as TaskStatus[]) || []
  const tasks = (tasksData.value?.tasks as Task[]) || []

  // Apply label/tag filter
  const filterIds = props.filters?.labels?.length ? props.filters.labels
    : props.filters?.tags?.length ? props.filters.tags
    : null
  const filteredTasks = filterIds
    ? tasks.filter(task => {
        const taskLabelIds = task.labels?.map(l => l.id) || []
        return filterIds.some(id => taskLabelIds.includes(id))
      })
    : tasks

  // When viewing all tasks or a workspace (multiple boards), merge statuses with the same name
  if (!props.departmentId) {
    const merged = new Map<string, { status: TaskStatus; statusIds: string[]; tasks: Task[] }>()
    for (const status of statuses.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const key = status.name.toLowerCase()
      if (merged.has(key)) {
        merged.get(key)!.statusIds.push(status.id)
      } else {
        merged.set(key, { status, statusIds: [status.id], tasks: [] })
      }
    }
    // Assign tasks to merged columns
    for (const task of filteredTasks) {
      for (const col of merged.values()) {
        if (col.statusIds.includes(task.statusId)) {
          col.tasks.push(task)
          break
        }
      }
    }
    return Array.from(merged.values()).map(col => ({
      status: col.status,
      tasks: col.tasks.sort((a, b) => a.sortOrder - b.sortOrder),
      isCollapsed: false
    }))
  }

  return statuses
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(status => ({
      status,
      tasks: filteredTasks
        .filter(task => task.statusId === status.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      isCollapsed: false
    }))
})

// Drag and drop state
const draggedTask = ref<Task | null>(null)
const dragOverColumn = ref<string | null>(null)
const dragOverIndex = ref<number | null>(null)

const handleDragStart = (task: Task) => {
  draggedTask.value = task
}

const handleDragEnd = () => {
  draggedTask.value = null
  dragOverColumn.value = null
  dragOverIndex.value = null
}

const handleDragOver = (statusId: string, index: number) => {
  dragOverColumn.value = statusId
  dragOverIndex.value = index
}

// Optimistic update state for rollback
const optimisticUpdates = ref<Map<string, { originalStatusId: string; originalSortOrder: number }>>(new Map())
const toast = useToast()

const handleDrop = async (targetStatusId: string, targetIndex: number) => {
  if (!draggedTask.value) return

  const task = draggedTask.value
  const currentStatusId = task.statusId
  const originalSortOrder = task.sortOrder

  // Calculate new sort order
  const targetColumn = columns.value.find(c => c.status.id === targetStatusId)
  if (!targetColumn) return

  let newSortOrder: number
  const targetTasks = targetColumn.tasks.filter(t => t.id !== task.id)

  if (targetTasks.length === 0) {
    newSortOrder = 1000
  } else if (targetIndex === 0) {
    newSortOrder = (targetTasks[0]?.sortOrder ?? 1000) - 1000
  } else if (targetIndex >= targetTasks.length) {
    newSortOrder = (targetTasks[targetTasks.length - 1]?.sortOrder ?? 0) + 1000
  } else {
    const prevOrder = targetTasks[targetIndex - 1]?.sortOrder ?? 0
    const nextOrder = targetTasks[targetIndex]?.sortOrder ?? 2000
    newSortOrder = Math.floor((prevOrder + nextOrder) / 2)
  }

  // Emit move event
  emit('taskMove', task.id, targetStatusId, newSortOrder)

  // Store original state for rollback
  optimisticUpdates.value.set(task.id, {
    originalStatusId: currentStatusId,
    originalSortOrder: originalSortOrder
  })

  // OPTIMISTIC UPDATE: Update local state immediately
  const tasksList = tasksData.value?.tasks as Task[]
  if (tasksList) {
    const taskIndex = tasksList.findIndex(t => t.id === task.id)
    if (taskIndex !== -1) {
      tasksList[taskIndex] = {
        ...tasksList[taskIndex],
        statusId: targetStatusId,
        sortOrder: newSortOrder
      }
    }
  }

  handleDragEnd()

  // API call in background
  try {
    if (currentStatusId !== targetStatusId) {
      await $fetch(`/api/agency/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: {
          statusId: targetStatusId,
          expectedVersion: task.version
        }
      })
    }

    // Update sort order
    await $fetch('/api/agency/tasks/reorder', {
      method: 'PATCH',
      body: {
        tasks: [{ id: task.id, sortOrder: newSortOrder }]
      }
    })

    // Success - remove from optimistic updates
    optimisticUpdates.value.delete(task.id)
  } catch (error: any) {
    console.error('Failed to move task:', error)

    // ROLLBACK: Revert to original state on error
    const original = optimisticUpdates.value.get(task.id)
    if (original && tasksList) {
      const taskIndex = tasksList.findIndex(t => t.id === task.id)
      if (taskIndex !== -1) {
        tasksList[taskIndex] = {
          ...tasksList[taskIndex],
          statusId: original.originalStatusId,
          sortOrder: original.originalSortOrder
        }
      }
    }
    optimisticUpdates.value.delete(task.id)

    // Handle version conflict specifically
    const isConflict = error?.data?.statusCode === 409 || error?.statusCode === 409
    if (isConflict) {
      toast.add({
        title: 'Update conflict',
        description: 'This task was modified by another user. Refreshing to get latest version.',
        color: 'warning',
        icon: 'i-lucide-users'
      })
      await refreshTasks()
    } else {
      toast.add({
        title: 'Failed to move task',
        description: 'The task has been reverted to its original position.',
        color: 'error',
        icon: 'i-lucide-alert-circle'
      })
    }
  }
}

const handleTaskClick = (task: Task) => {
  emit('taskClick', task)
}

const handleCreateTask = (statusId: string) => {
  emit('createTask', statusId)
}

// Mobile swipe action handlers
const handleTaskStatusChange = async (task: Task, statusId: string) => {
  try {
    await $fetch(`/api/agency/tasks/${task.id}/status`, {
      method: 'PATCH',
      body: { statusId }
    })
    refreshTasks()
  } catch (error) {
    console.error('Failed to update task status:', error)
  }
}

const handleTaskEdit = (task: Task) => {
  emit('taskEdit', task)
}

const handleTaskDelete = async (task: Task) => {
  emit('taskDelete', task)
}

const handleTaskLabelsUpdate = async (taskId: string, labelIds: string[]) => {
  try {
    // Use tags API - tags and labels are the same thing
    await $fetch(`/api/agency/tasks/${taskId}/tags`, {
      method: 'PUT',
      body: { tagIds: labelIds }
    })
    // Refresh tasks to get updated labels
    await refreshTasks()
    // Emit event for parent
    emit('taskLabelsUpdate', taskId, labelIds)
    toast.add({
      title: 'Labels updated',
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    console.error('Failed to update labels:', error)
    toast.add({
      title: 'Failed to update labels',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  }
}

// Handle new label creation
const handleCreateLabel = async (label: { name: string; color: string }) => {
  try {
    // Create the new tag/label
    await $fetch('/api/agency/tags', {
      method: 'POST',
      body: {
        name: label.name,
        color: label.color
      }
    })
    
    // Notify parent to refresh labels list
    emit('refreshLabels')
    
    toast.add({
      title: 'Label created',
      description: `"${label.name}" has been created`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    console.error('Failed to create label:', error)
    toast.add({
      title: 'Failed to create label',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  }
}

// ============================================
// Keyboard Navigation
// ============================================
const focusedColumnIndex = ref(0)
const focusedTaskIndex = ref(0)

const focusedTask = computed(() => {
  const column = columns.value[focusedColumnIndex.value]
  if (!column) return null
  return column.tasks[focusedTaskIndex.value] || null
})

const handleKeyDown = (event: KeyboardEvent) => {
  const totalColumns = columns.value.length
  if (totalColumns === 0) return

  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault()
      focusedColumnIndex.value = Math.min(focusedColumnIndex.value + 1, totalColumns - 1)
      focusedTaskIndex.value = Math.min(focusedTaskIndex.value, (columns.value[focusedColumnIndex.value]?.tasks.length || 1) - 1)
      break
    case 'ArrowLeft':
      event.preventDefault()
      focusedColumnIndex.value = Math.max(focusedColumnIndex.value - 1, 0)
      focusedTaskIndex.value = Math.min(focusedTaskIndex.value, (columns.value[focusedColumnIndex.value]?.tasks.length || 1) - 1)
      break
    case 'ArrowDown':
      event.preventDefault()
      const currentColumnTaskCount = columns.value[focusedColumnIndex.value]?.tasks.length || 0
      focusedTaskIndex.value = Math.min(focusedTaskIndex.value + 1, currentColumnTaskCount - 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedTaskIndex.value = Math.max(focusedTaskIndex.value - 1, 0)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (focusedTask.value) {
        emit('taskClick', focusedTask.value)
      }
      break
    case 'n':
    case 'N':
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      const currentStatusId = columns.value[focusedColumnIndex.value]?.status.id
      if (currentStatusId) {
        emit('createTask', currentStatusId)
      }
      break
    case 'e':
    case 'E':
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      if (focusedTask.value) {
        emit('taskEdit', focusedTask.value)
      }
      break
    case '1':
    case '2':
    case '3':
    case '4':
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (focusedTask.value) {
        const priorityMap: Record<string, TaskPriority> = {
          '1': 'urgent',
          '2': 'high',
          '3': 'medium',
          '4': 'low'
        }
        const newPriority = priorityMap[event.key]
        if (newPriority && newPriority !== focusedTask.value.priority) {
          updateTaskPriority(focusedTask.value, newPriority)
        }
      }
      break
    case 'Escape':
      event.preventDefault()
      ;(document.activeElement as HTMLElement)?.blur()
      break
  }
}

// Update task priority via API
const updateTaskPriority = async (task: Task, newPriority: TaskPriority) => {
  try {
    await $fetch(`/api/agency/tasks/${task.id}`, {
      method: 'PATCH',
      body: { priority: newPriority }
    })
    await refreshTasks()
    toast.add({
      title: 'Priority updated',
      description: `Task priority set to ${newPriority}`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    console.error('Failed to update priority:', error)
    toast.add({
      title: 'Failed to update priority',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  }
}

defineExpose({
  refreshTasks,
  columns,
  focusedTask,
  focusedColumnIndex,
  focusedTaskIndex,
  getTaskAtPosition: (columnIndex: number, taskIndex: number) => {
    const column = columns.value[columnIndex]
    return column?.tasks[taskIndex] || null
  },
  getColumnCount: () => columns.value.length,
  getTaskCount: (columnIndex: number) => columns.value[columnIndex]?.tasks.length || 0
})
</script>

<template>
  <div
    class="h-full flex flex-col bg-default"
    @keydown="handleKeyDown"
    tabindex="0"
    role="application"
    aria-label="Kanban board. Use arrow keys to navigate, Enter to open task, N to create, E to edit, 1-4 to set priority."
  >
    <!-- Loading state -->
    <template v-if="loading">
      <div
        class="flex gap-4 p-4 overflow-x-auto"
        role="status"
        aria-busy="true"
        aria-label="Loading Kanban board"
      >
        <WorkflowSkeletonColumn
          v-for="i in 5"
          :key="i"
          :card-count="i === 1 ? 4 : i === 2 ? 3 : 2"
        />
      </div>
    </template>

    <!-- Board -->
    <template v-else>
      <div
        class="flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden"
        role="list"
        aria-label="Task columns"
      >
        <WorkflowKanbanColumn
          v-for="(column, columnIndex) in columns"
          :key="column.status.id"
          :status="column.status"
          :tasks="column.tasks"
          :is-collapsed="column.isCollapsed"
          :is-drag-over="dragOverColumn === column.status.id"
          :drag-over-index="dragOverColumn === column.status.id ? dragOverIndex : null"
          :dragged-task-id="draggedTask?.id"
          :done-status-id="doneStatusId"
          :selected-task-id="selectedTaskId"
          :focused-task-id="focusedColumnIndex === columnIndex ? focusedTask?.id : undefined"
          :column-index="columnIndex"
          :total-columns="columns.length"
          :available-labels="availableLabels"
          @task-click="handleTaskClick"
          @task-drag-start="handleDragStart"
          @task-drag-end="handleDragEnd"
          @drag-over="(index) => handleDragOver(column.status.id, index)"
          @drop="(index) => handleDrop(column.status.id, index)"
          @create-task="handleCreateTask(column.status.id)"
          @task-status-change="handleTaskStatusChange"
          @task-edit="handleTaskEdit"
          @task-delete="handleTaskDelete"
          @task-labels-update="handleTaskLabelsUpdate"
          @create-label="handleCreateLabel"
        />

        <!-- Empty state if no columns -->
        <div v-if="columns.length === 0" class="flex-1 flex items-center justify-center">
          <div class="text-center p-8 border border-default rounded-lg">
            <UIcon name="i-lucide-columns" class="h-12 w-12 text-muted mx-auto mb-3" />
            <p class="text-muted">No statuses configured for this department</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.overflow-x-auto::-webkit-scrollbar {
  height: 6px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

@media (max-width: 768px) {
  .flex-1.flex.gap-4 {
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .overflow-x-auto {
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }

  .overflow-x-auto > :deep(.flex-shrink-0) {
    scroll-snap-align: start;
    width: calc(100vw - 2rem) !important;
    min-width: calc(100vw - 2rem) !important;
  }
}

@media (max-width: 480px) {
  .flex-1.flex.gap-4 {
    gap: 0.25rem;
    padding: 0.25rem;
  }

  .overflow-x-auto > :deep(.flex-shrink-0) {
    width: calc(100vw - 1rem) !important;
    min-width: calc(100vw - 1rem) !important;
  }
}
</style>
