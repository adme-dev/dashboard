<template>
  <div
    class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-md group/subtask transition-colors"
    :class="{ 'opacity-60': isCompleted }"
  >
    <!-- Checkbox -->
    <UCheckbox
      :model-value="isCompleted"
      @update:model-value="$emit('toggleComplete', subtask.id)"
    />

    <!-- Title (editable) -->
    <div class="flex-1 min-w-0">
      <div v-if="isEditing" class="flex items-center gap-1" @click.stop>
        <input
          ref="editInput"
          v-model="editTitle"
          type="text"
          class="flex-1 text-sm bg-white dark:bg-neutral-800 border rounded px-2 py-0.5 outline-none focus:border-blue-500"
          @keydown.enter="saveEdit"
          @keydown.escape="cancelEdit"
          @blur="saveEdit"
        />
      </div>
      <p
        v-else
        class="text-sm truncate cursor-pointer"
        :class="isCompleted ? 'line-through text-gray-400 dark:text-neutral-500' : 'text-gray-700 dark:text-neutral-200'"
        @dblclick="startEdit"
      >
        {{ subtask.title }}
      </p>
    </div>

    <!-- Priority -->
    <UBadge
      v-if="subtask.priority && subtask.priority !== 'medium'"
      :color="priorityColor"
      variant="subtle"
      size="xs"
    >
      {{ subtask.priority }}
    </UBadge>

    <!-- Assignee -->
    <UAvatar
      v-if="subtask.assigneeName"
      size="2xs"
      :text="subtask.assigneeName"
      class="flex-shrink-0"
    />

    <!-- Due Date -->
    <span
      v-if="subtask.dueDate"
      class="text-xs text-gray-500 dark:text-neutral-400 flex-shrink-0"
      :class="{ 'text-red-500': isOverdue }"
    >
      {{ formatDate(subtask.dueDate) }}
    </span>

    <!-- Status -->
    <span
      v-if="subtask.statusName"
      class="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
      :style="{
        backgroundColor: (subtask.statusColor || '#c4c4c4') + '20',
        color: subtask.statusColor || '#666',
      }"
    >
      {{ subtask.statusName }}
    </span>

    <!-- Actions -->
    <button
      class="p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded opacity-0 group-hover/subtask:opacity-100 transition-opacity flex-shrink-0"
      @click.stop="$emit('delete', subtask.id)"
    >
      <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500" />
    </button>
  </div>
</template>

<script setup lang="ts">
interface Subtask {
  id: string
  title: string
  priority?: string
  dueDate?: string
  completedAt?: string
  sortOrder?: number
  statusName?: string
  statusColor?: string
  statusCategory?: string
  assigneeId?: string
  assigneeName?: string
  assigneeAvatar?: string
  createdAt: string
  updatedAt: string
}

const props = defineProps<{
  subtask: Subtask
}>()

defineEmits<{
  toggleComplete: [subtaskId: string]
  delete: [subtaskId: string]
  update: [subtaskId: string, updates: Record<string, any>]
}>()

const isEditing = ref(false)
const editTitle = ref('')
const editInput = ref<HTMLInputElement | null>(null)

const isCompleted = computed(() =>
  props.subtask.statusCategory === 'done' || !!props.subtask.completedAt
)

const isOverdue = computed(() => {
  if (!props.subtask.dueDate || isCompleted.value) return false
  return new Date(props.subtask.dueDate) < new Date()
})

const priorityColor = computed(() => {
  switch (props.subtask.priority) {
    case 'critical': return 'error' as const
    case 'high': return 'warning' as const
    case 'low': return 'neutral' as const
    default: return 'neutral' as const
  }
})

function startEdit() {
  editTitle.value = props.subtask.title
  isEditing.value = true
  nextTick(() => {
    editInput.value?.focus()
    editInput.value?.select()
  })
}

function saveEdit() {
  const trimmed = editTitle.value.trim()
  if (trimmed && trimmed !== props.subtask.title) {
    // Emit update through parent
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
</script>
