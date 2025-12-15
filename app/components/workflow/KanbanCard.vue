<script setup lang="ts">
import { format, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns'
import type { Task, TaskPriority } from '~/types'

const props = defineProps<{
  task: Task
  isDragging?: boolean
}>()

const emit = defineEmits<{
  click: []
  dragStart: []
  dragEnd: []
}>()

// Priority styles
const priorityConfig: Record<TaskPriority, { color: string; icon: string; label: string }> = {
  urgent: { color: 'text-red-500', icon: 'i-lucide-alert-circle', label: 'Urgent' },
  high: { color: 'text-orange-500', icon: 'i-lucide-arrow-up', label: 'High' },
  medium: { color: 'text-yellow-500', icon: 'i-lucide-minus', label: 'Medium' },
  low: { color: 'text-blue-500', icon: 'i-lucide-arrow-down', label: 'Low' }
}

const priorityStyle = computed(() => priorityConfig[props.task.priority])

// Task type icon
const taskTypeIcons: Record<string, string> = {
  task: 'i-lucide-check-square',
  milestone: 'i-lucide-flag',
  bug: 'i-lucide-bug',
  feature: 'i-lucide-sparkles',
  review: 'i-lucide-eye',
  meeting: 'i-lucide-calendar'
}

const taskTypeIcon = computed(() => taskTypeIcons[props.task.taskType] || 'i-lucide-check-square')

// Due date formatting and styling
const dueDateInfo = computed(() => {
  if (!props.task.dueDate) return null

  const dueDate = new Date(props.task.dueDate)
  const today = new Date()

  let label: string
  let color: string
  let isOverdue = false

  if (isToday(dueDate)) {
    label = 'Today'
    color = 'text-amber-600 dark:text-amber-400'
  } else if (isTomorrow(dueDate)) {
    label = 'Tomorrow'
    color = 'text-blue-600 dark:text-blue-400'
  } else if (isPast(dueDate)) {
    const daysAgo = differenceInDays(today, dueDate)
    label = daysAgo === 1 ? 'Yesterday' : `${daysAgo}d overdue`
    color = 'text-red-600 dark:text-red-400'
    isOverdue = true
  } else {
    const daysUntil = differenceInDays(dueDate, today)
    if (daysUntil <= 7) {
      label = format(dueDate, 'EEE')
      color = 'text-muted'
    } else {
      label = format(dueDate, 'MMM d')
      color = 'text-muted'
    }
  }

  return { label, color, isOverdue }
})

// Progress for subtasks
const subtaskProgress = computed(() => {
  if (!props.task.subtaskCount || props.task.subtaskCount === 0) return null

  const completed = props.task.completedSubtasks || 0
  const total = props.task.subtaskCount
  const percentage = Math.round((completed / total) * 100)

  return { completed, total, percentage }
})

// Drag handlers
const handleDragStart = (e: DragEvent) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', props.task.id)
  }
  emit('dragStart')
}

const handleDragEnd = () => {
  emit('dragEnd')
}
</script>

<template>
  <div
    class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
    :class="{
      'opacity-50 scale-95 rotate-2': isDragging,
      'ring-2 ring-red-500/50': task.isBlocked
    }"
    draggable="true"
    @click="emit('click')"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Header: Priority & Type -->
    <div class="flex items-center gap-2 mb-2">
      <UTooltip :text="priorityStyle.label">
        <UIcon
          :name="priorityStyle.icon"
          :class="priorityStyle.color"
          class="h-4 w-4"
        />
      </UTooltip>

      <UTooltip :text="task.taskType">
        <UIcon
          :name="taskTypeIcon"
          class="h-4 w-4 text-muted"
        />
      </UTooltip>

      <div class="flex-1" />

      <!-- Blocked indicator -->
      <UTooltip v-if="task.isBlocked" :text="task.blockedReason || 'Blocked'">
        <UIcon
          name="i-lucide-ban"
          class="h-4 w-4 text-red-500"
        />
      </UTooltip>

      <!-- Comments count -->
      <div v-if="task.commentCount" class="flex items-center gap-1 text-muted">
        <UIcon name="i-lucide-message-square" class="h-3.5 w-3.5" />
        <span class="text-xs">{{ task.commentCount }}</span>
      </div>
    </div>

    <!-- Title -->
    <h4 class="font-medium text-sm text-highlighted line-clamp-2 mb-2">
      {{ task.title }}
    </h4>

    <!-- Labels -->
    <div v-if="task.labels?.length" class="flex flex-wrap gap-1 mb-2">
      <span
        v-for="label in task.labels.slice(0, 3)"
        :key="label.id"
        class="px-1.5 py-0.5 text-xs rounded-full"
        :style="{
          backgroundColor: `${label.color}20`,
          color: label.color
        }"
      >
        {{ label.name }}
      </span>
      <span
        v-if="task.labels.length > 3"
        class="px-1.5 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-700 text-muted"
      >
        +{{ task.labels.length - 3 }}
      </span>
    </div>

    <!-- Subtask Progress -->
    <div v-if="subtaskProgress" class="mb-2">
      <div class="flex items-center justify-between text-xs text-muted mb-1">
        <span>Subtasks</span>
        <span>{{ subtaskProgress.completed }}/{{ subtaskProgress.total }}</span>
      </div>
      <div class="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary rounded-full transition-all"
          :style="{ width: `${subtaskProgress.percentage}%` }"
        />
      </div>
    </div>

    <!-- Footer: Due Date & Assignee -->
    <div class="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700">
      <!-- Due date -->
      <div v-if="dueDateInfo" class="flex items-center gap-1" :class="dueDateInfo.color">
        <UIcon
          :name="dueDateInfo.isOverdue ? 'i-lucide-alert-triangle' : 'i-lucide-calendar'"
          class="h-3.5 w-3.5"
        />
        <span class="text-xs font-medium">{{ dueDateInfo.label }}</span>
      </div>
      <div v-else class="flex-1" />

      <!-- Assignee -->
      <div v-if="task.assignee" class="flex items-center gap-1.5">
        <UAvatar
          :alt="task.assignee.name"
          size="2xs"
        />
        <span class="text-xs text-muted truncate max-w-[80px]">
          {{ task.assignee.name.split(' ')[0] }}
        </span>
      </div>
      <div v-else class="flex items-center gap-1 text-muted">
        <UIcon name="i-lucide-user" class="h-3.5 w-3.5" />
        <span class="text-xs">Unassigned</span>
      </div>
    </div>

    <!-- Project info (if available) -->
    <div
      v-if="task.project"
      class="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700 text-xs text-muted truncate"
    >
      <UIcon name="i-lucide-folder" class="h-3 w-3 inline mr-1" />
      {{ task.project.clientName ? `${task.project.clientName} / ` : '' }}{{ task.project.name }}
    </div>
  </div>
</template>
