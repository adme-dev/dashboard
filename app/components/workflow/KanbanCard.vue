<script setup lang="ts">
import { format, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns'
import { onClickOutside } from '@vueuse/core'
import type { Task, TaskPriority, TaskLabel } from '~/types'

const props = defineProps<{
  task: Task
  isDragging?: boolean
  isSelected?: boolean
  showRecentlyUpdated?: boolean
  availableLabels?: TaskLabel[]
}>()

const emit = defineEmits<{
  click: []
  dragStart: []
  dragEnd: []
  updateLabels: [labelIds: string[]]
  createLabel: [label: { name: string; color: string }]
}>()

const showLabelMenu = ref(false)
const labelMenuRef = ref<HTMLElement | null>(null)
const showCreateLabelForm = ref(false)
const newLabelName = ref('')
const newLabelColor = ref('#13B5EA')
const creatingLabel = ref(false)

// Predefined colors for new labels
const labelColors = [
  '#13B5EA', // Xero Blue
  '#7DD3A8', // Green
  '#F4B942', // Yellow
  '#FF6B6B', // Red
  '#9B59B6', // Purple
  '#34495E', // Dark Blue
  '#E67E22', // Orange
  '#1ABC9C', // Teal
]

// Priority styles - opacity-based bgColor works in both light and dark modes
const priorityConfig: Record<TaskPriority, { color: string; bgColor: string; icon: string; label: string }> = {
  urgent: { color: '#FF6B6B', bgColor: '#FF6B6B20', icon: 'i-lucide-alert-circle', label: 'Urgent' },
  high: { color: '#F4B942', bgColor: '#F4B94220', icon: 'i-lucide-arrow-up', label: 'High' },
  medium: { color: '#13B5EA', bgColor: '#13B5EA20', icon: 'i-lucide-minus', label: 'Medium' },
  low: { color: '#7DD3A8', bgColor: '#7DD3A820', icon: 'i-lucide-arrow-down', label: 'Low' }
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
const showTypeIcon = computed(() => props.task.taskType && props.task.taskType !== 'task')

// Header row only renders if it has meaningful content
const hasHeaderContent = computed(() =>
  showTypeIcon.value
  || props.task.isBlocked
  || !!props.task.actualHours
  || !!props.task.estimatedHours
  || !!props.task.commentCount
)

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
    color = '#F4B942'
  } else if (isTomorrow(dueDate)) {
    label = 'Tomorrow'
    color = '#13B5EA'
  } else if (isPast(dueDate)) {
    const daysAgo = differenceInDays(today, dueDate)
    label = daysAgo === 1 ? 'Yesterday' : `${daysAgo}d overdue`
    color = '#FF6B6B'
    isOverdue = true
  } else {
    const daysUntil = differenceInDays(dueDate, today)
    if (daysUntil <= 7) {
      label = format(dueDate, 'EEE')
      color = ''
    } else {
      label = format(dueDate, 'MMM d')
      color = ''
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

// Label management
const currentLabelIds = computed(() => props.task.labels?.map(l => l.id) || [])

function toggleLabel(labelId: string) {
  const currentIds = currentLabelIds.value
  let newIds: string[]

  if (currentIds.includes(labelId)) {
    newIds = currentIds.filter(id => id !== labelId)
  } else {
    newIds = [...currentIds, labelId]
  }

  emit('updateLabels', newIds)
}

// Create new label
async function createNewLabel() {
  if (!newLabelName.value.trim()) return

  const nameToCreate = newLabelName.value.trim()
  const colorToCreate = newLabelColor.value

  creatingLabel.value = true

  try {
    // Call API to create new label
    const response = await $fetch('/api/agency/tags', {
      method: 'POST',
      body: {
        name: nameToCreate,
        color: colorToCreate
      }
    })

    // Add the new label to the task
    const newLabelId = (response as any).id
    if (newLabelId) {
      emit('updateLabels', [...currentLabelIds.value, newLabelId])
    }

    // Reset form
    newLabelName.value = ''
    newLabelColor.value = '#13B5EA'
    showCreateLabelForm.value = false
    showLabelMenu.value = false

    // Emit event to parent to refresh available labels
    emit('createLabel', { name: nameToCreate, color: colorToCreate })
  } catch (error) {
    console.error('Failed to create label:', error)
  } finally {
    creatingLabel.value = false
  }
}

function cancelCreateLabel() {
  showCreateLabelForm.value = false
  newLabelName.value = ''
  newLabelColor.value = '#13B5EA'
}

// Close label menu when clicking outside
onClickOutside(labelMenuRef, () => {
  showLabelMenu.value = false
  showCreateLabelForm.value = false
})
</script>

<template>
  <article
    class="relative bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md pl-3.5 pr-3 py-2.5 cursor-pointer transition-all hover:border-neutral-400 dark:hover:border-neutral-500 hover:shadow-sm group"
    :class="{
      'opacity-50 scale-95 rotate-1': isDragging,
      'border-[#FF6B6B] ring-1 ring-[#FF6B6B]/30': task.isBlocked,
      'border-[#13B5EA] ring-2 ring-[#13B5EA]/20': isSelected
    }"
    draggable="true"
    role="listitem"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Priority left-edge stripe -->
    <span
      class="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
      :style="{ backgroundColor: priorityStyle.color }"
      :title="`${priorityStyle.label} priority`"
      aria-hidden="true"
    />

    <!-- Header: type icon + indicators (only when non-default content) -->
    <div v-if="hasHeaderContent" class="flex items-center gap-2 mb-1.5" aria-hidden="true">
      <UIcon
        v-if="showTypeIcon"
        :name="taskTypeIcon"
        class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500"
        :title="task.taskType"
      />

      <div class="flex-1" />

      <!-- Blocked indicator -->
      <UIcon
        v-if="task.isBlocked"
        name="i-lucide-ban"
        class="h-3.5 w-3.5 text-[#FF6B6B]"
        :title="task.blockedReason || 'Blocked'"
      />

      <!-- Time tracking indicator -->
      <div
        v-if="task.actualHours || task.estimatedHours"
        class="flex items-center gap-0.5 text-[11px]"
        :class="{
          'text-[#FF6B6B]': task.estimatedHours && task.actualHours && task.actualHours > task.estimatedHours,
          'text-[#7DD3A8]': task.estimatedHours && task.actualHours && task.actualHours <= task.estimatedHours,
          'text-neutral-500 dark:text-neutral-400': !task.estimatedHours || !task.actualHours
        }"
        :title="`${task.actualHours || 0}h / ${task.estimatedHours || 0}h`"
      >
        <UIcon name="i-lucide-clock" class="h-3 w-3" />
        <span>{{ task.actualHours || 0 }}h</span>
      </div>

      <!-- Comments count -->
      <div v-if="task.commentCount" class="flex items-center gap-0.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
        <UIcon name="i-lucide-message-square" class="h-3 w-3" />
        <span>{{ task.commentCount }}</span>
      </div>
    </div>

    <!-- Title -->
    <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">
      {{ task.title }}
    </h4>

    <!-- Labels with Edit Button -->
    <div
      v-if="(task.labels?.length || 0) > 0"
      class="flex flex-wrap gap-1 mt-2 items-center"
    >
      <span
        v-for="label in task.labels?.slice(0, 3)"
        :key="label.id"
        class="px-1.5 py-0.5 text-xs rounded border"
        :style="{
          backgroundColor: `${label.color}15`,
          borderColor: `${label.color}40`,
          color: label.color
        }"
      >
        {{ label.name }}
      </span>
      <span
        v-if="(task.labels?.length || 0) > 3"
        class="px-1.5 py-0.5 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
      >
        +{{ (task.labels?.length || 0) - 3 }}
      </span>

      <!-- Add Label Button -->
      <div v-if="availableLabels?.length" class="relative" ref="labelMenuRef">
        <button
          class="w-5 h-5 rounded-full border border-dashed border-neutral-300 dark:border-neutral-600 flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:border-neutral-500 dark:hover:border-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          title="Add/Edit Labels"
          @click.stop="showLabelMenu = !showLabelMenu"
        >
          <UIcon name="i-lucide-plus" class="w-3 h-3" />
        </button>

        <!-- Label Menu -->
        <div
          v-if="showLabelMenu"
          class="absolute left-0 top-full mt-1 z-50 w-56 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-3"
          @click.stop
        >
          <!-- Existing Labels List -->
          <div v-if="!showCreateLabelForm">
            <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-1">Select Labels</div>
            <div class="flex flex-wrap gap-1 mb-3 max-h-32 overflow-y-auto">
              <button
                v-for="label in availableLabels"
                :key="label.id"
                class="px-2 py-1 text-xs rounded border transition-all"
                :class="currentLabelIds.includes(label.id)
                  ? 'border-transparent'
                  : 'border-neutral-200 dark:border-neutral-600 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-700'"
                :style="currentLabelIds.includes(label.id)
                  ? { backgroundColor: label.color + '30', color: label.color, borderColor: label.color }
                  : {}"
                @click.stop="toggleLabel(label.id)"
              >
                {{ label.name }}
              </button>
            </div>

            <!-- Create New Label Button -->
            <button
              class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-600 rounded hover:border-neutral-500 dark:hover:border-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              @click.stop="showCreateLabelForm = true"
            >
              <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" />
              Create New Label
            </button>
          </div>

          <!-- Create New Label Form -->
          <div v-else>
            <div class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Create New Label</div>

            <!-- Label Name Input -->
            <input
              v-model="newLabelName"
              type="text"
              placeholder="Label name..."
              class="w-full px-2 py-1.5 text-sm border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded mb-2 focus:outline-none focus:border-[#13B5EA] placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              @click.stop
              @keydown.enter="createNewLabel"
            />

            <!-- Color Picker -->
            <div class="flex flex-wrap gap-1.5 mb-3">
              <button
                v-for="color in labelColors"
                :key="color"
                class="w-6 h-6 rounded-full border-2 transition-all"
                :class="newLabelColor === color ? 'border-neutral-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'"
                :style="{ backgroundColor: color }"
                @click.stop="newLabelColor = color"
              />
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-2">
              <button
                class="flex-1 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                @click.stop="cancelCreateLabel"
              >
                Cancel
              </button>
              <button
                class="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-[#13B5EA] rounded hover:bg-[#0EA5E0] transition-colors disabled:opacity-50"
                :disabled="!newLabelName.trim() || creatingLabel"
                @click.stop="createNewLabel"
              >
                <UIcon v-if="creatingLabel" name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin inline mr-1" />
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Subtask Progress -->
    <div v-if="subtaskProgress" class="flex items-center gap-2 mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
      <UIcon name="i-lucide-list-checks" class="h-3 w-3 flex-shrink-0" />
      <div class="flex-1 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-[#13B5EA] rounded-full transition-all"
          :style="{ width: `${subtaskProgress.percentage}%` }"
        />
      </div>
      <span class="tabular-nums flex-shrink-0">{{ subtaskProgress.completed }}/{{ subtaskProgress.total }}</span>
    </div>

    <!-- Footer: Due Date & Assignee -->
    <div class="flex items-center justify-between gap-2 mt-2.5">
      <!-- Due date -->
      <div v-if="dueDateInfo" class="flex items-center gap-1 text-[11px] min-w-0">
        <UIcon
          :name="dueDateInfo.isOverdue ? 'i-lucide-alert-triangle' : 'i-lucide-calendar'"
          class="h-3 w-3 flex-shrink-0"
          :class="{ 'text-neutral-400 dark:text-neutral-500': !dueDateInfo.color }"
          :style="dueDateInfo.color ? { color: dueDateInfo.color } : undefined"
        />
        <span
          class="font-medium truncate"
          :class="{ 'text-neutral-500 dark:text-neutral-400': !dueDateInfo.color }"
          :style="dueDateInfo.color ? { color: dueDateInfo.color } : undefined"
        >{{ dueDateInfo.label }}</span>
      </div>
      <div v-else class="flex-1" />

      <!-- Assignee -->
      <div v-if="task.assignee" class="flex items-center gap-1.5 flex-shrink-0">
        <div
          class="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center text-[10px] font-medium text-neutral-700 dark:text-neutral-200"
        >
          {{ task.assignee.name.charAt(0).toUpperCase() }}
        </div>
        <span class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[80px]">
          {{ task.assignee.name.split(' ')[0] }}
        </span>
      </div>
      <div v-else class="flex items-center gap-1 text-neutral-400/70 dark:text-neutral-500/70 text-[11px] flex-shrink-0">
        <UIcon name="i-lucide-user" class="h-3 w-3" />
        <span>Unassigned</span>
      </div>
    </div>

    <!-- Project info (if available) -->
    <div
      v-if="task.project"
      class="flex items-center gap-1 mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 truncate"
    >
      <UIcon name="i-lucide-folder" class="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span class="sr-only">Project: </span>
      <span class="truncate">{{ task.project.clientName ? `${task.project.clientName} / ` : '' }}{{ task.project.name }}</span>
    </div>
  </article>
</template>
