<script setup lang="ts">
import type { Task, TaskPriority, TaskType, TaskStatus, TaskLabel } from '~/types'

const props = defineProps<{
  task?: Partial<Task>
  departmentId: string
  projectId?: string
  defaultStatusId?: string
}>()

const emit = defineEmits<{
  submit: [task: Partial<Task>]
  cancel: []
}>()

// Fetch statuses
const { data: statusesData } = await useFetch('/api/agency/statuses', {
  query: { departmentId: props.departmentId }
})

const statuses = computed(() => (statusesData.value as TaskStatus[]) || [])

// Fetch labels
const { data: labelsData } = await useFetch('/api/agency/labels', {
  query: { departmentId: props.departmentId }
})

const labels = computed(() => (labelsData.value as TaskLabel[]) || [])

// Fetch team members
const { data: membersData } = await useFetch('/api/agency/departments/members', {
  query: { departmentId: props.departmentId }
})

const members = computed(() => {
  const data = membersData.value as any[]
  return data?.map(m => ({
    label: m.name,
    value: m.id
  })) || []
})

// Fetch projects
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { status: 'active', limit: 50 }
})

const projects = computed(() => {
  const data = projectsData.value?.projects as any[]
  return data?.map(p => ({
    label: `${p.clientName ? p.clientName + ' / ' : ''}${p.name}`,
    value: p.id
  })) || []
})

// Form state
const form = reactive({
  title: props.task?.title || '',
  description: props.task?.description || '',
  statusId: props.task?.statusId || props.defaultStatusId || '',
  priority: props.task?.priority || 'medium' as TaskPriority,
  taskType: props.task?.taskType || 'task' as TaskType,
  assigneeId: props.task?.assigneeId || null as string | null,
  projectId: props.task?.projectId || props.projectId || null as string | null,
  dueDate: props.task?.dueDate || null as string | null,
  startDate: props.task?.startDate || null as string | null,
  estimatedHours: props.task?.estimatedHours || null as number | null,
  labelIds: (props.task?.labels?.map(l => l.id) || []) as string[]
})

const isEditing = computed(() => !!props.task?.id)

// Priority options
const priorityOptions: { label: string; value: TaskPriority; icon: string; color: string }[] = [
  { label: 'Urgent', value: 'urgent', icon: 'i-lucide-alert-circle', color: 'text-red-500' },
  { label: 'High', value: 'high', icon: 'i-lucide-arrow-up', color: 'text-orange-500' },
  { label: 'Medium', value: 'medium', icon: 'i-lucide-minus', color: 'text-yellow-500' },
  { label: 'Low', value: 'low', icon: 'i-lucide-arrow-down', color: 'text-blue-500' }
]

// Task type options
const taskTypeOptions: { label: string; value: TaskType; icon: string; description: string }[] = [
  { label: 'Task', value: 'task', icon: 'i-lucide-check-square', description: 'Standard work item' },
  { label: 'Milestone', value: 'milestone', icon: 'i-lucide-flag', description: 'Key deliverable or checkpoint' },
  { label: 'Bug', value: 'bug', icon: 'i-lucide-bug', description: 'Issue or defect to fix' },
  { label: 'Feature', value: 'feature', icon: 'i-lucide-sparkles', description: 'New functionality' },
  { label: 'Review', value: 'review', icon: 'i-lucide-eye', description: 'Review or approval needed' },
  { label: 'Meeting', value: 'meeting', icon: 'i-lucide-calendar', description: 'Scheduled meeting' }
]

// Validation
const errors = ref<Record<string, string>>({})

const validate = () => {
  errors.value = {}

  if (!form.title.trim()) {
    errors.value.title = 'Title is required'
  }

  if (!form.statusId) {
    errors.value.statusId = 'Status is required'
  }

  return Object.keys(errors.value).length === 0
}

// Submit handler
const loading = ref(false)

const handleSubmit = async () => {
  if (!validate()) return

  loading.value = true

  try {
    const payload = {
      ...form,
      departmentId: props.departmentId
    }

    emit('submit', payload)
  } catch (error) {
    console.error('Failed to save task:', error)
  } finally {
    loading.value = false
  }
}

// Set default status when statuses load
watch(statuses, (newStatuses) => {
  if (!form.statusId && newStatuses.length > 0) {
    const defaultStatus = newStatuses.find(s => s.isDefault) || newStatuses[0]
    form.statusId = defaultStatus.id
  }
}, { immediate: true })
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <!-- Title -->
    <UFormGroup label="Title" :error="errors.title" required>
      <UInput
        v-model="form.title"
        placeholder="Enter task title"
        :disabled="loading"
        autofocus
      />
    </UFormGroup>

    <!-- Description -->
    <UFormGroup label="Description">
      <UTextarea
        v-model="form.description"
        placeholder="Describe the task..."
        :rows="3"
        :disabled="loading"
      />
    </UFormGroup>

    <!-- Status & Priority -->
    <div class="grid grid-cols-2 gap-4">
      <UFormGroup label="Status" :error="errors.statusId" required>
        <USelectMenu
          v-model="form.statusId"
          :options="statuses.map(s => ({ label: s.name, value: s.id, color: s.color }))"
          placeholder="Select status"
          option-attribute="label"
          value-attribute="value"
          :disabled="loading"
        >
          <template #leading="{ modelValue }">
            <div
              v-if="modelValue"
              class="w-3 h-3 rounded-full"
              :style="{ backgroundColor: statuses.find(s => s.id === modelValue)?.color }"
            />
          </template>
        </USelectMenu>
      </UFormGroup>

      <UFormGroup label="Priority" required>
        <USelectMenu
          v-model="form.priority"
          :options="priorityOptions"
          option-attribute="label"
          value-attribute="value"
          :disabled="loading"
        >
          <template #leading="{ modelValue }">
            <UIcon
              :name="priorityOptions.find(p => p.value === modelValue)?.icon || ''"
              :class="priorityOptions.find(p => p.value === modelValue)?.color"
              class="h-4 w-4"
            />
          </template>
        </USelectMenu>
      </UFormGroup>
    </div>

    <!-- Task Type -->
    <UFormGroup label="Type">
      <URadioGroup
        v-model="form.taskType"
        :options="taskTypeOptions"
        :disabled="loading"
        :ui="{ fieldset: 'grid grid-cols-3 gap-2' }"
      >
        <template #label="{ option }">
          <div class="flex items-center gap-2">
            <UIcon :name="option.icon" class="h-4 w-4" />
            <span>{{ option.label }}</span>
          </div>
        </template>
      </URadioGroup>
    </UFormGroup>

    <!-- Assignee & Project -->
    <div class="grid grid-cols-2 gap-4">
      <UFormGroup label="Assignee">
        <USelectMenu
          v-model="form.assigneeId"
          :options="[{ label: 'Unassigned', value: null }, ...members]"
          placeholder="Select assignee"
          option-attribute="label"
          value-attribute="value"
          :disabled="loading"
        >
          <template #leading>
            <UIcon name="i-lucide-user" class="h-4 w-4 text-muted" />
          </template>
        </USelectMenu>
      </UFormGroup>

      <UFormGroup label="Project">
        <USelectMenu
          v-model="form.projectId"
          :options="[{ label: 'No project', value: null }, ...projects]"
          placeholder="Select project"
          option-attribute="label"
          value-attribute="value"
          :disabled="loading"
        >
          <template #leading>
            <UIcon name="i-lucide-folder" class="h-4 w-4 text-muted" />
          </template>
        </USelectMenu>
      </UFormGroup>
    </div>

    <!-- Dates -->
    <div class="grid grid-cols-2 gap-4">
      <UFormGroup label="Start Date">
        <UInput
          v-model="form.startDate"
          type="date"
          :disabled="loading"
        />
      </UFormGroup>

      <UFormGroup label="Due Date">
        <UInput
          v-model="form.dueDate"
          type="date"
          :disabled="loading"
        />
      </UFormGroup>
    </div>

    <!-- Estimated Hours -->
    <UFormGroup label="Estimated Hours">
      <UInput
        v-model.number="form.estimatedHours"
        type="number"
        min="0"
        step="0.5"
        placeholder="0"
        :disabled="loading"
      >
        <template #trailing>
          <span class="text-muted text-sm">hours</span>
        </template>
      </UInput>
    </UFormGroup>

    <!-- Labels -->
    <UFormGroup label="Labels">
      <USelectMenu
        v-model="form.labelIds"
        :options="labels.map(l => ({ label: l.name, value: l.id, color: l.color }))"
        placeholder="Select labels"
        option-attribute="label"
        value-attribute="value"
        multiple
        :disabled="loading"
      >
        <template #label>
          <div v-if="form.labelIds.length" class="flex flex-wrap gap-1">
            <span
              v-for="labelId in form.labelIds"
              :key="labelId"
              class="px-2 py-0.5 text-xs rounded-full"
              :style="{
                backgroundColor: `${labels.find(l => l.id === labelId)?.color}20`,
                color: labels.find(l => l.id === labelId)?.color
              }"
            >
              {{ labels.find(l => l.id === labelId)?.name }}
            </span>
          </div>
          <span v-else class="text-muted">Select labels</span>
        </template>
        <template #option="{ option }">
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :style="{ backgroundColor: option.color }"
            />
            <span>{{ option.label }}</span>
          </div>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="loading"
        @click="emit('cancel')"
      />
      <UButton
        :label="isEditing ? 'Update Task' : 'Create Task'"
        type="submit"
        color="primary"
        :loading="loading"
      />
    </div>
  </form>
</template>
