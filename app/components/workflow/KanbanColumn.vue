<script setup lang="ts">
import type { Task, TaskStatus } from '~/types'
import { RecycleScroller } from 'vue-virtual-scroller'

const props = defineProps<{
  status: TaskStatus
  tasks: Task[]
  isCollapsed?: boolean
  isDragOver?: boolean
  dragOverIndex?: number | null
  draggedTaskId?: string
  doneStatusId?: string
  selectedTaskId?: string | null
  focusedTaskId?: string  // Keyboard navigation focus
  columnIndex?: number
  totalColumns?: number
}>()

// Use virtual scrolling when there are many tasks for performance
const VIRTUAL_SCROLL_THRESHOLD = 20
const useVirtualScroll = computed(() => props.tasks.length > VIRTUAL_SCROLL_THRESHOLD)

const emit = defineEmits<{
  taskClick: [task: Task]
  taskDragStart: [task: Task]
  taskDragEnd: []
  dragOver: [index: number]
  drop: [index: number]
  createTask: []
  toggleCollapse: []
  taskStatusChange: [task: Task, statusId: string]
  taskDelete: [task: Task]
  taskEdit: [task: Task]
}>()

// Detect if on mobile/touch device
const isMobile = ref(false)
onMounted(() => {
  isMobile.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})

const columnRef = ref<HTMLElement | null>(null)

// Get status category styles
const categoryStyles = computed(() => {
  switch (props.status.category) {
    case 'not_started':
      return 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'
    case 'in_progress':
      return 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
    case 'review':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
    case 'done':
      return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
    case 'cancelled':
      return 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
    default:
      return 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'
  }
})

// Handle drag events on the column
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()

  if (!columnRef.value) return

  // Calculate drop index based on mouse position
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
  // Only emit if leaving the column entirely
  const relatedTarget = e.relatedTarget as HTMLElement
  if (!columnRef.value?.contains(relatedTarget)) {
    emit('dragOver', -1)
  }
}
</script>

<template>
  <section
    class="flex-shrink-0 w-72 flex flex-col max-h-full"
    :class="{ 'w-12': isCollapsed }"
    :aria-label="`${status.name} column, ${tasks.length} tasks${columnIndex !== undefined ? `, column ${columnIndex + 1} of ${totalColumns}` : ''}`"
    role="listitem"
    aria-roledescription="kanban column"
  >
    <!-- Column Header -->
    <header
      class="flex items-center gap-2 p-3 rounded-t-lg border-b-2"
      :class="categoryStyles"
      :style="{ borderBottomColor: status.color }"
    >
      <div
        class="w-3 h-3 rounded-full flex-shrink-0"
        :style="{ backgroundColor: status.color }"
        aria-hidden="true"
      />

      <template v-if="!isCollapsed">
        <h3 class="font-medium text-sm truncate flex-1">{{ status.name }}</h3>
        <UBadge
          :label="String(tasks.length)"
          size="xs"
          color="neutral"
          variant="subtle"
          :aria-label="`${tasks.length} tasks`"
        />
        <UButton
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
          :aria-label="`Add task to ${status.name}`"
          @click="emit('createTask')"
        />
      </template>

      <template v-else>
        <div class="flex flex-col items-center gap-1 -rotate-90 origin-center whitespace-nowrap">
          <h3 class="font-medium text-xs">{{ status.name }}</h3>
          <UBadge
            :label="String(tasks.length)"
            size="xs"
            color="neutral"
            variant="subtle"
            :aria-label="`${tasks.length} tasks`"
          />
        </div>
      </template>
    </header>

    <!-- Task Cards Container -->
    <div
      v-if="!isCollapsed"
      ref="columnRef"
      class="flex-1 overflow-y-auto p-2 bg-neutral-50/50 dark:bg-neutral-900/30 rounded-b-lg min-h-[200px] transition-colors"
      :class="{ 'bg-primary/5 ring-2 ring-primary/20': isDragOver, 'space-y-2': !useVirtualScroll }"
      role="list"
      :aria-label="`Tasks in ${status.name}`"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
    >
      <!-- Drop indicator before first card -->
      <div
        v-if="isDragOver && dragOverIndex === 0"
        class="h-1 bg-primary rounded-full mx-1 transition-all"
      />

      <!-- Virtual scrolling for large task lists (> 20 items) -->
      <RecycleScroller
        v-if="useVirtualScroll && tasks.length > 0"
        v-slot="{ item: task, index }"
        :items="tasks"
        :item-size="120"
        key-field="id"
        class="h-full"
      >
        <div class="pb-2">
          <!-- Mobile: Use swipeable card -->
          <WorkflowMobileTaskCard
            v-if="isMobile"
            :task="task"
            :is-dragging="task.id === draggedTaskId"
            :done-status-id="doneStatusId"
            data-task-card
            @click="emit('taskClick', task)"
            @status-change="(statusId: string) => emit('taskStatusChange', task, statusId)"
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
            data-task-card
            @click="emit('taskClick', task)"
            @drag-start="emit('taskDragStart', task)"
            @drag-end="emit('taskDragEnd')"
          />

          <!-- Drop indicator after each card -->
          <div
            v-if="isDragOver && dragOverIndex === index + 1"
            class="h-1 bg-primary rounded-full mx-1 mt-2 transition-all"
          />
        </div>
      </RecycleScroller>

      <!-- Standard rendering for smaller lists (better drag-drop UX) -->
      <template v-else-if="tasks.length > 0">
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
            data-task-card
            @click="emit('taskClick', task)"
            @drag-start="emit('taskDragStart', task)"
            @drag-end="emit('taskDragEnd')"
          />

          <!-- Drop indicator after each card -->
          <div
            v-if="isDragOver && dragOverIndex === index + 1"
            class="h-1 bg-primary rounded-full mx-1 transition-all"
          />
        </template>
      </template>

      <!-- Empty state -->
      <div
        v-if="tasks.length === 0"
        class="flex flex-col items-center justify-center py-8 text-center"
      >
        <UIcon name="i-lucide-inbox" class="h-8 w-8 text-muted mb-2" />
        <p class="text-sm text-muted">No tasks</p>
        <UButton
          label="Add task"
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          class="mt-2"
          @click="emit('createTask')"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Custom scrollbar for vertical scroll */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: var(--ui-border);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: var(--ui-border-hover);
}
</style>
