<script setup lang="ts">
import type { Task, TaskStatus, TaskLabel } from '~/types'

const props = defineProps<{
  status: TaskStatus
  tasks: Task[]
  isCollapsed?: boolean
  isDragOver?: boolean
  dragOverIndex?: number | null
  draggedTaskId?: string
  doneStatusId?: string
  selectedTaskId?: string | null
  focusedTaskId?: string
  columnIndex?: number
  totalColumns?: number
  availableLabels?: TaskLabel[]
}>()

const emit = defineEmits<{
  taskClick: [task: Task]
  taskDragStart: [task: Task]
  taskDragEnd: []
  dragOver: [index: number]
  drop: [index: number]
  createTask: []
  taskStatusChange: [task: Task, statusId: string]
  taskDelete: [task: Task]
  taskEdit: [task: Task]
  taskLabelsUpdate: [taskId: string, labelIds: string[]]
  createLabel: [label: { name: string; color: string }]  // New event
}>()

// Detect if on mobile/touch device
const isMobile = ref(false)
onMounted(() => {
  isMobile.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})

const columnRef = ref<HTMLElement | null>(null)

// Get status category color
const categoryColor = computed(() => {
  switch (props.status.category) {
    case 'not_started':
      return '#9ca3af'
    case 'in_progress':
      return '#13B5EA'
    case 'review':
      return '#F4B942'
    case 'done':
      return '#7DD3A8'
    case 'cancelled':
      return '#FF6B6B'
    default:
      return '#9ca3af'
  }
})

// Handle drag events
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (!columnRef.value) return

  const cards = columnRef.value.querySelectorAll('[data-task-card]')
  let dropIndex = props.tasks.length

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i] as HTMLElement
    const rect = card.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    if (e.clientY < midY) {
      dropIndex = i
      break
    }
  }
  emit('dragOver', dropIndex)
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  if (props.dragOverIndex !== null && props.dragOverIndex !== undefined) {
    emit('drop', props.dragOverIndex)
  }
}

const handleDragLeave = (e: DragEvent) => {
  const relatedTarget = e.relatedTarget as HTMLElement
  if (!columnRef.value?.contains(relatedTarget)) {
    emit('dragOver', -1)
  }
}
</script>

<template>
  <section
    class="flex-shrink-0 w-80 flex flex-col max-h-full"
    :class="{ 'w-14': isCollapsed }"
    :aria-label="`${status.name} column, ${tasks.length} tasks${columnIndex !== undefined ? `, column ${columnIndex + 1} of ${totalColumns}` : ''}`"
    role="listitem"
    aria-roledescription="kanban column"
  >
    <!-- Column Header -->
    <header
      class="flex items-center gap-3 p-4 border border-neutral-200 dark:border-neutral-700 rounded-t-lg bg-white dark:bg-neutral-800"
      :style="{ borderTopWidth: '3px', borderTopColor: status.color || categoryColor }"
    >
      <div
        class="w-3 h-3 rounded-sm flex-shrink-0"
        :style="{ backgroundColor: status.color || categoryColor }"
        aria-hidden="true"
      />

      <template v-if="!isCollapsed">
        <h3 class="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate flex-1">{{ status.name }}</h3>
        <span
          class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 text-xs font-medium rounded"
          :aria-label="`${tasks.length} tasks`"
        >
          {{ tasks.length }}
        </span>
        <button
          class="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors opacity-0 group-hover:opacity-100"
          :aria-label="`Add task to ${status.name}`"
          @click="emit('createTask')"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
        </button>
      </template>

      <template v-else>
        <div class="flex flex-col items-center gap-1 -rotate-90 origin-center whitespace-nowrap">
          <h3 class="font-semibold text-xs text-neutral-900 dark:text-neutral-100">{{ status.name }}</h3>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ tasks.length }}</span>
        </div>
      </template>
    </header>

    <!-- Task Cards Container -->
    <div
      v-if="!isCollapsed"
      ref="columnRef"
      class="flex-1 overflow-y-auto p-3 space-y-2 bg-white dark:bg-neutral-800/50 border border-t-0 border-neutral-200 dark:border-neutral-700 rounded-b-lg min-h-[200px] transition-colors"
      :class="{ 'bg-[#13B5EA]/5 ring-2 ring-[#13B5EA]/20': isDragOver }"
      role="list"
      :aria-label="`Tasks in ${status.name}`"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
    >
      <!-- Drop indicator before first card -->
      <div
        v-if="isDragOver && dragOverIndex === 0"
        class="h-0.5 bg-[#13B5EA] rounded-full mx-1 mb-2 transition-all"
      />

      <!-- Task Cards -->
      <template v-for="(task, index) in tasks" :key="task.id">
        <!-- Mobile: Use swipeable card -->
        <WorkflowMobileTaskCard
          v-if="isMobile"
          :task="task"
          :is-dragging="task.id === draggedTaskId"
          :done-status-id="doneStatusId"
          data-task-card
          @click="emit('taskClick', task)"
          @status-change="(statusId) => emit('taskStatusChange', task, statusId)"
          @delete="emit('taskDelete', task)"
          @edit="emit('taskEdit', task)"
        />

        <!-- Desktop: Use standard draggable card -->
        <WorkflowKanbanCard
          v-else
          :task="task"
          :is-dragging="task.id === draggedTaskId"
          :is-selected="task.id === selectedTaskId || task.id === focusedTaskId"
          :show-recently-updated="true"
          :available-labels="availableLabels"
          data-task-card
          @click="emit('taskClick', task)"
          @drag-start="emit('taskDragStart', task)"
          @drag-end="emit('taskDragEnd')"
          @update-labels="(labelIds) => emit('taskLabelsUpdate', task.id, labelIds)"
          @create-label="(label) => emit('createLabel', label)"
        />

        <!-- Drop indicator after each card -->
        <div
          v-if="isDragOver && dragOverIndex === index + 1"
          class="h-0.5 bg-[#13B5EA] rounded-full mx-1 my-2 transition-all"
        />
      </template>

      <!-- Empty state -->
      <div
        v-if="tasks.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <UIcon name="i-lucide-inbox" class="h-10 w-10 text-neutral-300 dark:text-neutral-600 mb-3" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-3">No tasks</p>
        <button
          class="px-3 py-1.5 border border-neutral-200 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 text-xs font-medium rounded hover:border-neutral-400 dark:hover:border-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          @click="emit('createTask')"
        >
          Add task
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.25);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.4);
}
</style>
