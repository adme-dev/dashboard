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

// Priority styles - XeroFlow colors
const priorityConfig: Record<TaskPriority, { color: string; bgColor: string; icon: string; label: string }> = {
  urgent: { color: '#FF6B6B', bgColor: '#FFEBEE', icon: 'i-lucide-alert-circle', label: 'Urgent' },
  high: { color: '#F4B942', bgColor: '#FFF8E1', icon: 'i-lucide-arrow-up', label: 'High' },
  medium: { color: '#13B5EA', bgColor: '#E6F7FC', icon: 'i-lucide-minus', label: 'Medium' },
  low: { color: '#7DD3A8', bgColor: '#E8F5E9', icon: 'i-lucide-arrow-down', label: 'Low' }
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
      color = '#666666'
    } else {
      label = format(dueDate, 'MMM d')
      color = '#666666'
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
    class="bg-white border border-black/20 rounded p-3 cursor-pointer transition-all hover:border-black hover:shadow-sm group"
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
    <!-- Header: Priority & Type -->
    <div class="flex items-center gap-2 mb-2" aria-hidden="true">
      <div
        class="w-5 h-5 rounded flex items-center justify-center"
        :style="{ backgroundColor: priorityStyle.bgColor }"
        :title="priorityStyle.label"
      >
        <UIcon
          :name="priorityStyle.icon"
          class="h-3 w-3"
          :style="{ color: priorityStyle.color }"
        />
      </div>

      <UIcon
        :name="taskTypeIcon"
        class="h-4 w-4 text-black/40"
        :title="task.taskType"
      />

      <div class="flex-1" />

      <!-- Blocked indicator -->
      <UIcon
        v-if="task.isBlocked"
        name="i-lucide-ban"
        class="h-4 w-4 text-[#FF6B6B]"
        :title="task.blockedReason || 'Blocked'"
      />

      <!-- Time tracking indicator -->
      <div
        v-if="task.actualHours || task.estimatedHours"
        class="flex items-center gap-1 text-xs"
        :class="{
          'text-[#FF6B6B]': task.estimatedHours && task.actualHours && task.actualHours > task.estimatedHours,
          'text-[#7DD3A8]': task.estimatedHours && task.actualHours && task.actualHours <= task.estimatedHours,
          'text-black/50': !task.estimatedHours || !task.actualHours
        }"
        :title="`${task.actualHours || 0}h / ${task.estimatedHours || 0}h`"
      >
        <UIcon name="i-lucide-clock" class="h-3.5 w-3.5" />
        <span>{{ task.actualHours || 0 }}h</span>
      </div>

      <!-- Comments count -->
      <div v-if="task.commentCount" class="flex items-center gap-1 text-black/50 text-xs">
        <UIcon name="i-lucide-message-square" class="h-3.5 w-3.5" />
        <span>{{ task.commentCount }}</span>
      </div>
    </div>

    <!-- Title -->
    <h4 class="font-medium text-sm text-black line-clamp-2 mb-2">
      {{ task.title }}
    </h4>

    <!-- Labels with Edit Button -->
    <div class="flex flex-wrap gap-1 mb-2 items-center">
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
        class="px-1.5 py-0.5 text-xs rounded bg-black/5 text-black/60"
      >
        +{{ (task.labels?.length || 0) - 3 }}
      </span>
      
      <!-- Add Label Button -->
      <div v-if="availableLabels?.length" class="relative" ref="labelMenuRef">
        <button
          class="w-5 h-5 rounded-full border border-dashed border-black/30 flex items-center justify-center text-black/40 hover:border-black/60 hover:text-black/60 transition-colors"
          title="Add/Edit Labels"
          @click.stop="showLabelMenu = !showLabelMenu"
        >
          <UIcon name="i-lucide-plus" class="w-3 h-3" />
        </button>
        
        <!-- Label Menu -->
        <div
          v-if="showLabelMenu"
          class="absolute left-0 top-full mt-1 z-50 w-56 bg-white border border-black/20 rounded-lg shadow-lg p-3"
          @click.stop
        >
          <!-- Existing Labels List -->
          <div v-if="!showCreateLabelForm">
            <div class="text-xs font-medium text-black/60 mb-2 px-1">Select Labels</div>
            <div class="flex flex-wrap gap-1 mb-3 max-h-32 overflow-y-auto">
              <button
                v-for="label in availableLabels"
                :key="label.id"
                class="px-2 py-1 text-xs rounded border transition-all"
                :class="currentLabelIds.includes(label.id)
                  ? 'border-transparent'
                  : 'border-black/20 bg-transparent hover:bg-black/5'"
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
              class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-black/70 border border-dashed border-black/30 rounded hover:border-black/50 hover:bg-black/5 transition-colors"
              @click.stop="showCreateLabelForm = true"
            >
              <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" />
              Create New Label
            </button>
          </div>
          
          <!-- Create New Label Form -->
          <div v-else>
            <div class="text-xs font-medium text-black/60 mb-2">Create New Label</div>
            
            <!-- Label Name Input -->
            <input
              v-model="newLabelName"
              type="text"
              placeholder="Label name..."
              class="w-full px-2 py-1.5 text-sm border border-black/20 rounded mb-2 focus:outline-none focus:border-[#13B5EA]"
              @click.stop
              @keydown.enter="createNewLabel"
            />
            
            <!-- Color Picker -->
            <div class="flex flex-wrap gap-1.5 mb-3">
              <button
                v-for="color in labelColors"
                :key="color"
                class="w-6 h-6 rounded-full border-2 transition-all"
                :class="newLabelColor === color ? 'border-black scale-110' : 'border-transparent hover:scale-105'"
                :style="{ backgroundColor: color }"
                @click.stop="newLabelColor = color"
              />
            </div>
            
            <!-- Action Buttons -->
            <div class="flex gap-2">
              <button
                class="flex-1 px-3 py-1.5 text-xs font-medium text-black/60 border border-black/20 rounded hover:bg-black/5 transition-colors"
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
    <div v-if="subtaskProgress" class="mb-2">
      <div class="flex items-center justify-between text-xs text-black/50 mb-1">
        <span>Subtasks</span>
        <span>{{ subtaskProgress.completed }}/{{ subtaskProgress.total }}</span>
      </div>
      <div class="h-1.5 bg-black/10 rounded-full overflow-hidden">
        <div
          class="h-full bg-[#13B5EA] rounded-full transition-all"
          :style="{ width: `${subtaskProgress.percentage}%` }"
        />
      </div>
    </div>

    <!-- Footer: Due Date & Assignee -->
    <div class="flex items-center justify-between mt-2 pt-2 border-t border-black/10">
      <!-- Due date -->
      <div v-if="dueDateInfo" class="flex items-center gap-1 text-xs">
        <UIcon
          :name="dueDateInfo.isOverdue ? 'i-lucide-alert-triangle' : 'i-lucide-calendar'"
          class="h-3.5 w-3.5"
          :style="{ color: dueDateInfo.color }"
        />
        <span class="font-medium" :style="{ color: dueDateInfo.color }">{{ dueDateInfo.label }}</span>
      </div>
      <div v-else class="flex-1" />

      <!-- Assignee -->
      <div v-if="task.assignee" class="flex items-center gap-1.5">
        <div
          class="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center text-xs font-medium text-black"
        >
          {{ task.assignee.name.charAt(0).toUpperCase() }}
        </div>
        <span class="text-xs text-black/60 truncate max-w-[80px]">
          {{ task.assignee.name.split(' ')[0] }}
        </span>
      </div>
      <div v-else class="flex items-center gap-1 text-black/40 text-xs">
        <UIcon name="i-lucide-user" class="h-3.5 w-3.5" />
        <span>Unassigned</span>
      </div>
    </div>

    <!-- Project info (if available) -->
    <div
      v-if="task.project"
      class="mt-2 pt-2 border-t border-black/10 text-xs text-black/50 truncate"
    >
      <UIcon name="i-lucide-folder" class="h-3 w-3 inline mr-1" aria-hidden="true" />
      <span class="sr-only">Project: </span>
      {{ task.project.clientName ? `${task.project.clientName} / ` : '' }}{{ task.project.name }}
    </div>
  </article>
</template>
