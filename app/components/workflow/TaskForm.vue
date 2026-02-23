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
  const response = membersData.value as { members?: any[] } | null
  const data = response?.members || []
  return data.map(m => ({
    label: m.name,
    value: m.id
  }))
})

// Fetch projects
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { status: 'active', limit: 50 }
})

const projects = computed(() => {
  const response = projectsData.value as { projects?: any[] } | null
  const data = response?.projects || []
  return data.map(p => ({
    label: `${p.clientName ? p.clientName + ' / ' : ''}${p.name}`,
    value: p.id
  }))
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

// Priority options - XeroFlow colors
const priorityOptions: { label: string; value: TaskPriority; icon: string; color: string; bgColor: string }[] = [
  { label: 'Urgent', value: 'urgent', icon: 'i-lucide-alert-circle', color: '#FF6B6B', bgColor: '#FFEBEE' },
  { label: 'High', value: 'high', icon: 'i-lucide-arrow-up', color: '#F4B942', bgColor: '#FFF8E1' },
  { label: 'Medium', value: 'medium', icon: 'i-lucide-minus', color: '#13B5EA', bgColor: '#E6F7FC' },
  { label: 'Low', value: 'low', icon: 'i-lucide-arrow-down', color: '#7DD3A8', bgColor: '#E8F5E9' }
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
    const payload = { ...form, departmentId: props.departmentId }
    emit('submit', payload as unknown as Partial<Task>)
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
    if (defaultStatus) {
      form.statusId = defaultStatus.id
    }
  }
}, { immediate: true })
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-5">
    <!-- Title -->
    <div>
      <label class="block text-sm font-medium text-black mb-2">
        Title <span class="text-[#FF6B6B]">*</span>
      </label>
      <input
        v-model="form.title"
        type="text"
        placeholder="Enter task title"
        class="w-full px-4 py-2.5 border border-black/20 rounded text-black placeholder:text-black/40 focus:outline-none focus:border-[#13B5EA] transition-colors"
        :class="{ 'border-[#FF6B6B]': errors.title }"
        :disabled="loading"
        autofocus
      />
      <p v-if="errors.title" class="mt-1 text-sm text-[#FF6B6B]">{{ errors.title }}</p>
    </div>

    <!-- Description -->
    <div>
      <label class="block text-sm font-medium text-black mb-2">Description</label>
      <textarea
        v-model="form.description"
        placeholder="Describe the task..."
        rows="3"
        class="w-full px-4 py-2.5 border border-black/20 rounded text-black placeholder:text-black/40 focus:outline-none focus:border-[#13B5EA] transition-colors resize-none"
        :disabled="loading"
      ></textarea>
    </div>

    <!-- Status & Priority -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-black mb-2">
          Status <span class="text-[#FF6B6B]">*</span>
        </label>
        <select
          v-model="form.statusId"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black bg-white focus:outline-none focus:border-[#13B5EA] transition-colors"
          :class="{ 'border-[#FF6B6B]': errors.statusId }"
          :disabled="loading"
        >
          <option value="" disabled>Select status</option>
          <option v-for="status in statuses" :key="status.id" :value="status.id">
            {{ status.name }}
          </option>
        </select>
        <p v-if="errors.statusId" class="mt-1 text-sm text-[#FF6B6B]">{{ errors.statusId }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-black mb-2">
          Priority <span class="text-[#FF6B6B]">*</span>
        </label>
        <select
          v-model="form.priority"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black bg-white focus:outline-none focus:border-[#13B5EA] transition-colors"
          :disabled="loading"
        >
          <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Task Type -->
    <div>
      <label class="block text-sm font-medium text-black mb-2">Type</label>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="type in taskTypeOptions"
          :key="type.value"
          type="button"
          class="flex items-center gap-2 px-3 py-2 border rounded text-sm transition-colors"
          :class="form.taskType === type.value ? 'border-black bg-black text-white' : 'border-black/20 text-black/60 hover:border-black hover:text-black'"
          :disabled="loading"
          @click="form.taskType = type.value"
        >
          <UIcon :name="type.icon" class="w-4 h-4" />
          <span>{{ type.label }}</span>
        </button>
      </div>
    </div>

    <!-- Assignee & Project -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-black mb-2">Assignee</label>
        <select
          v-model="form.assigneeId"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black bg-white focus:outline-none focus:border-[#13B5EA] transition-colors"
          :disabled="loading"
        >
          <option :value="null">Unassigned</option>
          <option v-for="member in members" :key="member.value" :value="member.value">
            {{ member.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm font-medium text-black mb-2">Project</label>
        <select
          v-model="form.projectId"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black bg-white focus:outline-none focus:border-[#13B5EA] transition-colors"
          :disabled="loading"
        >
          <option :value="null">No project</option>
          <option v-for="project in projects" :key="project.value" :value="project.value">
            {{ project.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Dates -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-black mb-2">Start Date</label>
        <input
          v-model="form.startDate"
          type="date"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black focus:outline-none focus:border-[#13B5EA] transition-colors"
          :disabled="loading"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-black mb-2">Due Date</label>
        <input
          v-model="form.dueDate"
          type="date"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black focus:outline-none focus:border-[#13B5EA] transition-colors"
          :disabled="loading"
        />
      </div>
    </div>

    <!-- Estimated Hours -->
    <div>
      <label class="block text-sm font-medium text-black mb-2">Estimated Hours</label>
      <div class="relative">
        <input
          v-model.number="form.estimatedHours"
          type="number"
          min="0"
          step="0.5"
          placeholder="0"
          class="w-full px-4 py-2.5 border border-black/20 rounded text-black placeholder:text-black/40 focus:outline-none focus:border-[#13B5EA] transition-colors"
          :disabled="loading"
        />
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-black/40">hours</span>
      </div>
    </div>

    <!-- Labels -->
    <div>
      <label class="block text-sm font-medium text-black mb-2">Labels</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="label in labels"
          :key="label.id"
          type="button"
          class="px-3 py-1.5 text-sm rounded border transition-colors"
          :class="form.labelIds.includes(label.id) ? 'border-black bg-black text-white' : 'border-black/20 text-black/60 hover:border-black'"
          :style="!form.labelIds.includes(label.id) ? { borderColor: label.color + '40', color: label.color } : {}"
          :disabled="loading"
          @click="form.labelIds = form.labelIds.includes(label.id) ? form.labelIds.filter(id => id !== label.id) : [...form.labelIds, label.id]"
        >
          {{ label.name }}
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-5 border-t border-black/10">
      <button
        type="button"
        class="px-5 py-2.5 border border-black/20 text-black font-medium rounded hover:bg-black/5 transition-colors"
        :disabled="loading"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="px-5 py-2.5 bg-black text-white font-medium rounded hover:bg-black/80 transition-colors disabled:opacity-50"
        :disabled="loading"
      >
        {{ loading ? 'Saving...' : (isEditing ? 'Update Task' : 'Create Task') }}
      </button>
    </div>
  </form>
</template>
