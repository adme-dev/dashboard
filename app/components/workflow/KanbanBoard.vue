<script setup lang="ts">
import type { Task, TaskStatus, KanbanFilters, TaskPriority } from '~/types'

const props = defineProps<{
  departmentId?: string
  projectId?: string
  filters?: KanbanFilters
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
  taskMove: [taskId: string, newStatusId: string, newOrder: number]
  createTask: [statusId: string]
}>()

// Fetch statuses for this department
const { data: statusesData, pending: statusesPending } = await useFetch('/api/agency/statuses', {
  query: computed(() => ({
    departmentId: props.departmentId
  }))
})

// Fetch tasks
const { data: tasksData, pending: tasksPending, refresh: refreshTasks } = await useFetch('/api/agency/tasks', {
  query: computed(() => ({
    departmentId: props.departmentId,
    projectId: props.projectId,
    assigneeId: props.filters?.assigneeId,
    priority: props.filters?.priority,
    search: props.filters?.search,
    includeCompleted: props.filters?.showCompleted ?? false,
    limit: 200
  }))
})

const loading = computed(() => statusesPending.value || tasksPending.value)

// Group tasks by status
const columns = computed(() => {
  const statuses = (statusesData.value as TaskStatus[]) || []
  const tasks = (tasksData.value?.tasks as Task[]) || []

  return statuses
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(status => ({
      status,
      tasks: tasks
        .filter(task => task.statusId === status.id)
        .filter(task => {
          // Apply label filter if set
          if (props.filters?.labels?.length) {
            const taskLabelIds = task.labels?.map(l => l.id) || []
            return props.filters.labels.some(labelId => taskLabelIds.includes(labelId))
          }
          return true
        })
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

const handleDrop = async (targetStatusId: string, targetIndex: number) => {
  if (!draggedTask.value) return

  const task = draggedTask.value
  const currentStatusId = task.statusId

  // Calculate new sort order
  const targetColumn = columns.value.find(c => c.status.id === targetStatusId)
  if (!targetColumn) return

  let newSortOrder: number
  const targetTasks = targetColumn.tasks.filter(t => t.id !== task.id)

  if (targetTasks.length === 0) {
    newSortOrder = 1000
  } else if (targetIndex === 0) {
    newSortOrder = targetTasks[0].sortOrder - 1000
  } else if (targetIndex >= targetTasks.length) {
    newSortOrder = targetTasks[targetTasks.length - 1].sortOrder + 1000
  } else {
    const prevOrder = targetTasks[targetIndex - 1].sortOrder
    const nextOrder = targetTasks[targetIndex].sortOrder
    newSortOrder = Math.floor((prevOrder + nextOrder) / 2)
  }

  // Emit move event
  emit('taskMove', task.id, targetStatusId, newSortOrder)

  // Optimistic update - update status if changed
  if (currentStatusId !== targetStatusId) {
    try {
      await $fetch(`/api/agency/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: { statusId: targetStatusId }
      })

      // Also update sort order
      await $fetch('/api/agency/tasks/reorder', {
        method: 'PATCH',
        body: {
          tasks: [{ id: task.id, sortOrder: newSortOrder }]
        }
      })

      refreshTasks()
    } catch (error) {
      console.error('Failed to move task:', error)
    }
  }

  handleDragEnd()
}

const handleTaskClick = (task: Task) => {
  emit('taskClick', task)
}

const handleCreateTask = (statusId: string) => {
  emit('createTask', statusId)
}

// Expose refresh method
defineExpose({ refreshTasks })
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Loading state -->
    <template v-if="loading">
      <div class="flex gap-4 p-4 overflow-x-auto">
        <div v-for="i in 5" :key="i" class="flex-shrink-0 w-72">
          <USkeleton class="h-10 w-full mb-3" />
          <div class="space-y-3">
            <USkeleton v-for="j in 3" :key="j" class="h-24 w-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- Board -->
    <template v-else>
      <div class="flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden">
        <WorkflowKanbanColumn
          v-for="column in columns"
          :key="column.status.id"
          :status="column.status"
          :tasks="column.tasks"
          :is-collapsed="column.isCollapsed"
          :is-drag-over="dragOverColumn === column.status.id"
          :drag-over-index="dragOverColumn === column.status.id ? dragOverIndex : null"
          :dragged-task-id="draggedTask?.id"
          @task-click="handleTaskClick"
          @task-drag-start="handleDragStart"
          @task-drag-end="handleDragEnd"
          @drag-over="(index) => handleDragOver(column.status.id, index)"
          @drop="(index) => handleDrop(column.status.id, index)"
          @create-task="handleCreateTask(column.status.id)"
        />

        <!-- Empty state if no columns -->
        <div v-if="columns.length === 0" class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <UIcon name="i-lucide-columns" class="h-12 w-12 text-muted mx-auto mb-3" />
            <p class="text-muted">No statuses configured for this department</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Custom scrollbar for horizontal scroll */
.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: var(--ui-border);
  border-radius: 4px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: var(--ui-border-hover);
}
</style>
