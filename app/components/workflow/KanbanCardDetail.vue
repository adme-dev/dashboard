<script setup lang="ts">
import { format } from 'date-fns'
import type { Task, TaskActivity, TaskLabel, TaskStatus, TaskPriority, TaskType } from '~/types'

const props = defineProps<{
  taskId: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  updated: []
  deleted: []
}>()

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>

// Fetch full task details
const task = ref<Task | null>(null)
const loading = ref(false)
const activitiesData = ref<{ activities?: TaskActivity[] } | null>(null)
const timeEntriesData = ref<{ entries?: unknown[], summary?: Record<string, any> } | null>(null)
const statusesData = ref<TaskStatus[]>([])
const labelsData = ref<TaskLabel[]>([])

async function refreshActivities() {
  try {
    activitiesData.value = await apiFetch<{ activities?: TaskActivity[] }>(`/api/agency/tasks/${props.taskId}/activities`)
  } catch {
    activitiesData.value = null
  }
}

async function refreshTimeEntries() {
  try {
    timeEntriesData.value = await apiFetch<{ entries?: unknown[], summary?: Record<string, any> }>(`/api/agency/tasks/${props.taskId}/time-entries`)
  } catch {
    timeEntriesData.value = null
  }
}

async function refreshStatuses() {
  try {
    statusesData.value = await apiFetch<TaskStatus[]>('/api/agency/statuses', {
      query: { departmentId: task.value?.departmentId }
    })
  } catch {
    statusesData.value = []
  }
}

async function refreshLabels() {
  try {
    labelsData.value = await apiFetch<TaskLabel[]>('/api/agency/labels', {
      query: { departmentId: task.value?.departmentId }
    })
  } catch {
    labelsData.value = []
  }
}

async function refresh() {
  loading.value = true
  try {
    task.value = await apiFetch<Task>(`/api/agency/tasks/${props.taskId}`)
    await Promise.all([refreshActivities(), refreshTimeEntries(), refreshStatuses(), refreshLabels()])
  } catch {
    task.value = null
  } finally {
    loading.value = false
  }
}

if (props.open) await refresh()

const timeEntries = computed(() => (timeEntriesData.value as any)?.entries || [])
const timeSummary = computed(() => (timeEntriesData.value as any)?.summary || {})

const activities = computed(() => {
  const response = activitiesData.value as unknown as { activities?: TaskActivity[] } | undefined
  return response?.activities || []
})

const statuses = computed(() => statusesData.value || [])

const labels = computed(() => labelsData.value || [])

// Edit mode states
const isEditingTitle = ref(false)
const isEditingDescription = ref(false)
const editTitle = ref('')
const editDescription = ref('')

// Priority options
const priorityOptions: { label: string; value: TaskPriority; icon: string; color: string }[] = [
  { label: 'Urgent', value: 'urgent', icon: 'i-lucide-alert-circle', color: 'text-red-500' },
  { label: 'High', value: 'high', icon: 'i-lucide-arrow-up', color: 'text-orange-500' },
  { label: 'Medium', value: 'medium', icon: 'i-lucide-minus', color: 'text-yellow-500' },
  { label: 'Low', value: 'low', icon: 'i-lucide-arrow-down', color: 'text-blue-500' }
]

// Task type options
const taskTypeOptions: { label: string; value: TaskType; icon: string }[] = [
  { label: 'Task', value: 'task', icon: 'i-lucide-check-square' },
  { label: 'Milestone', value: 'milestone', icon: 'i-lucide-flag' },
  { label: 'Bug', value: 'bug', icon: 'i-lucide-bug' },
  { label: 'Feature', value: 'feature', icon: 'i-lucide-sparkles' },
  { label: 'Review', value: 'review', icon: 'i-lucide-eye' },
  { label: 'Meeting', value: 'meeting', icon: 'i-lucide-calendar' }
]

// Update handlers
const updateField = async (field: string, value: any) => {
  if (!task.value) return

  try {
    await apiFetch(`/api/agency/tasks/${props.taskId}`, {
      method: 'PUT',
      body: { [field]: value }
    })
    await refresh()
    emit('updated')
  } catch (error) {
    console.error(`Failed to update ${field}:`, error)
  }
}

const saveTitle = async () => {
  if (editTitle.value.trim() && editTitle.value !== task.value?.title) {
    await updateField('title', editTitle.value.trim())
  }
  isEditingTitle.value = false
}

const saveDescription = async () => {
  if (editDescription.value !== task.value?.description) {
    await updateField('description', editDescription.value)
  }
  isEditingDescription.value = false
}

const updateStatus = async (statusId: unknown) => {
  if (typeof statusId !== 'string') return
  await apiFetch(`/api/agency/tasks/${props.taskId}/status`, {
    method: 'PATCH',
    body: { statusId }
  })
  await refresh()
  emit('updated')
}

const updateAssignee = async (assigneeId: string | null) => {
  await apiFetch(`/api/agency/tasks/${props.taskId}/assignee`, {
    method: 'PATCH',
    body: { assigneeId }
  })
  await refresh()
  emit('updated')
}

// Time entry handling
const showAddTimeEntry = ref(false)
const newTimeEntry = ref({
  date: new Date().toISOString().split('T')[0],
  hours: 1,
  description: '',
  billable: true
})
const submittingTimeEntry = ref(false)

const addTimeEntry = async () => {
  if (!task.value || newTimeEntry.value.hours <= 0) return

  submittingTimeEntry.value = true
  try {
    await apiFetch('/api/agency/time/entries', {
      method: 'POST',
      body: {
        taskId: props.taskId,
        projectId: task.value.projectId,
        date: newTimeEntry.value.date,
        hours: newTimeEntry.value.hours,
        description: newTimeEntry.value.description,
        billable: newTimeEntry.value.billable
      }
    })
    // Reset form
    newTimeEntry.value = {
      date: new Date().toISOString().split('T')[0],
      hours: 1,
      description: '',
      billable: true
    }
    showAddTimeEntry.value = false
    await refreshTimeEntries()
    await refresh()
    emit('updated')
  } catch (error) {
    console.error('Failed to add time entry:', error)
  } finally {
    submittingTimeEntry.value = false
  }
}

// Comment handling
const newComment = ref('')
const submittingComment = ref(false)

const submitComment = async () => {
  if (!newComment.value.trim()) return

  submittingComment.value = true
  try {
    await apiFetch(`/api/agency/tasks/${props.taskId}/comments`, {
      method: 'POST',
      body: { content: newComment.value.trim() }
    })
    newComment.value = ''
    await refresh()
  } catch (error) {
    console.error('Failed to add comment:', error)
  } finally {
    submittingComment.value = false
  }
}

// Delete task
const showDeleteConfirm = ref(false)
const deleting = ref(false)

const deleteTask = async () => {
  deleting.value = true
  try {
    await apiFetch(`/api/agency/tasks/${props.taskId}`, {
      method: 'DELETE'
    })
    emit('deleted')
    emit('update:open', false)
  } catch (error) {
    console.error('Failed to delete task:', error)
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
  }
}

// Watch for open/task changes
watch([() => props.open, () => props.taskId], ([isOpen]) => {
  if (isOpen) {
    refresh()
  }
})

// Initialize edit values when task loads
watch(task, (t) => {
  if (t) {
    editTitle.value = t.title
    editDescription.value = t.description || ''
  }
}, { immediate: true })
</script>

<template>
  <USlideover
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon
          v-if="task?.taskType"
          :name="taskTypeOptions.find(t => t.value === task?.taskType)?.icon || 'i-lucide-check-square'"
          class="h-5 w-5 text-muted"
        />
        <span class="font-semibold">Task Details</span>
      </div>
    </template>

    <template #default>
      <!-- Loading -->
      <div v-if="loading" class="p-6 space-y-4">
        <USkeleton class="h-8 w-3/4" />
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-6 w-1/2" />
      </div>

      <!-- Content -->
      <div v-else-if="task" class="p-6 space-y-6">
        <!-- Title -->
        <div>
          <div
            v-if="!isEditingTitle"
            class="text-xl font-semibold text-highlighted cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-2 py-1 -mx-2"
            @click="isEditingTitle = true"
          >
            {{ task.title }}
          </div>
          <div v-else class="flex gap-2">
            <UInput
              v-model="editTitle"
              class="flex-1"
              autofocus
              @keyup.enter="saveTitle"
              @keyup.escape="isEditingTitle = false"
            />
            <UButton icon="i-lucide-check" color="primary" @click="saveTitle" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="isEditingTitle = false" />
          </div>
        </div>

        <!-- Status & Priority Row -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Status -->
          <UFormField label="Status">
            <USelectMenu
              :model-value="task.statusId"
              :options="statuses.map(s => ({ label: s.name, value: s.id, color: s.color }))"
              option-attribute="label"
              value-attribute="value"
              @update:model-value="updateStatus"
            >
              <template #leading="{ modelValue }">
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: statuses.find(s => s.id === modelValue)?.color }"
                />
              </template>
            </USelectMenu>
          </UFormField>

          <!-- Priority -->
          <UFormField label="Priority">
            <USelectMenu
              :model-value="task.priority"
              :options="priorityOptions"
              option-attribute="label"
              value-attribute="value"
              @update:model-value="(v) => updateField('priority', v)"
            >
              <template #leading="{ modelValue }">
                <UIcon
                  :name="priorityOptions.find(p => p.value === modelValue)?.icon || ''"
                  :class="priorityOptions.find(p => p.value === modelValue)?.color"
                  class="h-4 w-4"
                />
              </template>
            </USelectMenu>
          </UFormField>
        </div>

        <!-- Assignee & Due Date -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Assignee -->
          <UFormField label="Assignee">
            <div class="flex items-center gap-2">
              <UAvatar
                v-if="task.assignee"
                :alt="task.assignee.name"
                size="sm"
              />
              <span class="text-sm">{{ task.assignee?.name || 'Unassigned' }}</span>
            </div>
          </UFormField>

          <!-- Due Date -->
          <UFormField label="Due Date">
            <UInput
              :model-value="task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''"
              type="date"
              @update:model-value="(v) => updateField('dueDate', v || null)"
            />
          </UFormField>
        </div>

        <!-- Task Type -->
        <UFormField label="Type">
          <USelectMenu
            :model-value="task.taskType"
            :options="taskTypeOptions"
            option-attribute="label"
            value-attribute="value"
            @update:model-value="(v) => updateField('taskType', v)"
          >
            <template #leading="{ modelValue }">
              <UIcon
                :name="taskTypeOptions.find(t => t.value === modelValue)?.icon || ''"
                class="h-4 w-4"
              />
            </template>
          </USelectMenu>
        </UFormField>

        <!-- Labels -->
        <UFormField label="Labels">
          <div class="flex flex-wrap gap-2">
            <span
              v-for="label in task.labels"
              :key="label.id"
              class="px-2 py-1 text-sm rounded-full"
              :style="{
                backgroundColor: `${label.color}20`,
                color: label.color
              }"
            >
              {{ label.name }}
            </span>
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="ghost"
              label="Add"
            />
          </div>
        </UFormField>

        <!-- Description -->
        <UFormField label="Description">
          <div
            v-if="!isEditingDescription"
            class="min-h-[80px] p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
            @click="isEditingDescription = true"
          >
            <p v-if="task.description" class="text-sm whitespace-pre-wrap">{{ task.description }}</p>
            <p v-else class="text-sm text-muted italic">Click to add description...</p>
          </div>
          <div v-else class="space-y-2">
            <UTextarea
              v-model="editDescription"
              :rows="4"
              placeholder="Add a description..."
              autofocus
            />
            <div class="flex gap-2">
              <UButton label="Save" color="primary" size="sm" @click="saveDescription" />
              <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="isEditingDescription = false" />
            </div>
          </div>
        </UFormField>

        <!-- Blocked Status -->
        <div v-if="task.isBlocked" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
            <UIcon name="i-lucide-ban" class="h-4 w-4" />
            <span class="font-medium">Blocked</span>
          </div>
          <p v-if="task.blockedReason" class="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
            {{ task.blockedReason }}
          </p>
        </div>

        <!-- Approval Workflow -->
        <div class="border-t border-neutral-200 dark:border-neutral-700 pt-6">
          <ApprovalWorkflow :task-id="taskId" @updated="refresh(); emit('updated')" />
        </div>

        <!-- Time Tracking -->
        <div class="border-t border-neutral-200 dark:border-neutral-700 pt-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-medium flex items-center gap-2">
              <UIcon name="i-lucide-clock" class="h-4 w-4" />
              Time Tracking
            </h3>
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="primary"
              variant="ghost"
              label="Log Time"
              @click="showAddTimeEntry = true"
            />
          </div>

          <!-- Time Summary -->
          <div v-if="timeSummary.totalHours > 0 || task.estimatedHours" class="grid grid-cols-3 gap-3 mb-4">
            <div class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg text-center">
              <p class="text-xs text-neutral-500">Estimated</p>
              <p class="text-lg font-semibold">{{ task.estimatedHours || 0 }}h</p>
            </div>
            <div class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg text-center">
              <p class="text-xs text-neutral-500">Logged</p>
              <p class="text-lg font-semibold" :class="{ 'text-error-600': timeSummary.isOverBudget }">
                {{ timeSummary.totalHours || 0 }}h
              </p>
            </div>
            <div class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg text-center">
              <p class="text-xs text-neutral-500">Remaining</p>
              <p class="text-lg font-semibold" :class="timeSummary.variance > 0 ? 'text-error-600' : 'text-success-600'">
                {{ task.estimatedHours ? Math.max(0, (task.estimatedHours - (timeSummary.totalHours || 0))).toFixed(1) : '-' }}h
              </p>
            </div>
          </div>

          <!-- Progress bar if estimated hours exist -->
          <div v-if="task.estimatedHours" class="mb-4">
            <div class="flex justify-between text-xs text-neutral-500 mb-1">
              <span>Progress</span>
              <span>{{ Math.round(((timeSummary.totalHours || 0) / task.estimatedHours) * 100) }}%</span>
            </div>
            <div class="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                class="h-full transition-all"
                :class="timeSummary.isOverBudget ? 'bg-error-500' : 'bg-primary-500'"
                :style="{ width: `${Math.min(100, ((timeSummary.totalHours || 0) / task.estimatedHours) * 100)}%` }"
              />
            </div>
          </div>

          <!-- Add Time Entry Form -->
          <div v-if="showAddTimeEntry" class="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg mb-4 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Date">
                <UInput v-model="newTimeEntry.date" type="date" size="sm" />
              </UFormField>
              <UFormField label="Hours">
                <UInput v-model.number="newTimeEntry.hours" type="number" step="0.25" min="0.25" max="24" size="sm" />
              </UFormField>
            </div>
            <UFormField label="Description">
              <UInput v-model="newTimeEntry.description" placeholder="What did you work on?" size="sm" />
            </UFormField>
            <div class="flex items-center justify-between">
              <UCheckbox v-model="newTimeEntry.billable" label="Billable" />
              <div class="flex gap-2">
                <UButton label="Cancel" size="sm" color="neutral" variant="ghost" @click="showAddTimeEntry = false" />
                <UButton
                  label="Log Time"
                  size="sm"
                  color="primary"
                  :loading="submittingTimeEntry"
                  @click="addTimeEntry"
                />
              </div>
            </div>
          </div>

          <!-- Time Entries List -->
          <div v-if="timeEntries.length > 0" class="space-y-2">
            <div
              v-for="entry in timeEntries.slice(0, 5)"
              :key="entry.id"
              class="flex items-center gap-3 text-sm p-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg"
            >
              <UAvatar
                v-if="entry.userAvatar"
                :src="entry.userAvatar"
                :alt="entry.userName"
                size="xs"
              />
              <UAvatar v-else :alt="entry.userName" size="xs" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate">{{ entry.userName }}</span>
                  <span class="text-neutral-500 text-xs">{{ entry.date }}</span>
                </div>
                <p v-if="entry.description" class="text-neutral-500 text-xs truncate">{{ entry.description }}</p>
              </div>
              <div class="text-right">
                <span class="font-medium">{{ entry.hours }}h</span>
                <UBadge v-if="entry.billable" size="xs" color="success" class="ml-1">$</UBadge>
              </div>
            </div>
            <div v-if="timeEntries.length > 5" class="text-center">
              <UButton
                :label="`View all ${timeEntries.length} entries`"
                size="xs"
                color="neutral"
                variant="ghost"
              />
            </div>
          </div>
          <div v-else-if="!showAddTimeEntry" class="text-center py-4 text-neutral-500 text-sm">
            No time logged yet
          </div>
        </div>

        <!-- Activity Feed -->
        <div class="border-t border-neutral-200 dark:border-neutral-700 pt-6">
          <h3 class="font-medium mb-4 flex items-center gap-2">
            <UIcon name="i-lucide-activity" class="h-4 w-4" />
            Activity
          </h3>

          <!-- Add Comment -->
          <div class="flex gap-3 mb-4">
            <UAvatar alt="You" size="sm" />
            <div class="flex-1">
              <UTextarea
                v-model="newComment"
                placeholder="Write a comment..."
                :rows="2"
                :disabled="submittingComment"
              />
              <div class="flex justify-end mt-2">
                <UButton
                  label="Comment"
                  color="primary"
                  size="sm"
                  :loading="submittingComment"
                  :disabled="!newComment.trim()"
                  @click="submitComment"
                />
              </div>
            </div>
          </div>

          <!-- Activity List -->
          <div class="space-y-4">
            <div
              v-for="activity in activities"
              :key="activity.id"
              class="flex gap-3 text-sm"
            >
              <UAvatar
                v-if="activity.user"
                :alt="activity.user.name"
                size="sm"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ activity.user?.name || 'System' }}</span>
                  <span class="text-muted text-xs">
                    {{ format(new Date(activity.createdAt), 'MMM d, h:mm a') }}
                  </span>
                </div>
                <p class="text-muted mt-1">{{ activity.content }}</p>
              </div>
            </div>

            <div v-if="activities.length === 0" class="text-center py-4 text-muted text-sm">
              No activity yet
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          label="Delete"
          @click="showDeleteConfirm = true"
        />
        <UButton
          label="Close"
          color="neutral"
          @click="emit('update:open', false)"
        />
      </div>
    </template>
  </USlideover>

  <!-- Delete Confirmation Modal -->
  <UModal v-model:open="showDeleteConfirm">
    <template #header>
      <span class="font-semibold text-red-600">Delete Task</span>
    </template>
    <template #body>
      <p>Are you sure you want to delete this task? This action cannot be undone.</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="showDeleteConfirm = false"
        />
        <UButton
          label="Delete"
          color="error"
          :loading="deleting"
          @click="deleteTask"
        />
      </div>
    </template>
  </UModal>
</template>
