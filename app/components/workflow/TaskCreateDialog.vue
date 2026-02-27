<script setup lang="ts">
const props = defineProps<{
  open: boolean
  statuses: Array<{ id: string; name: string; color: string; category?: string }>
  teamMembers: Array<{ id: string; name: string; email?: string; role?: string; avatar?: string; active_task_count?: number }>
  projects: Array<{ id: string; name: string; client_name?: string }>
  labels: Array<{ id: string; name: string; color: string }>
  departmentId?: string
  workspaceId?: string
  boardName?: string
  initialStatusId?: string
  initialDate?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
}>()

const toast = useToast()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

// Form state
const form = ref({
  title: '',
  description: '',
  projectId: undefined as string | undefined,
  statusId: undefined as string | undefined,
  priority: 'medium' as 'urgent' | 'high' | 'medium' | 'low',
  assigneeId: undefined as string | undefined,
  dueDate: '',
  startDate: '',
  estimatedHours: undefined as number | undefined,
  labels: [] as string[]
})

// AI state
const aiInput = ref('')
const aiLoading = ref(false)
const aiFields = ref<Set<string>>(new Set())
const aiSuggestedAssigneeId = ref<string | null>(null)
const aiAssigneeReason = ref<string | null>(null)
const aiSuggestions = ref<string[]>([])
const aiConfidence = ref<number>(0)
const creating = ref(false)

const priorityOptions = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
]

// Reset when modal opens
watch(isOpen, (val) => {
  if (val) {
    form.value = {
      title: '',
      description: '',
      projectId: undefined,
      statusId: props.initialStatusId,
      priority: 'medium',
      assigneeId: undefined,
      dueDate: props.initialDate || '',
      startDate: '',
      estimatedHours: undefined,
      labels: []
    }
    aiInput.value = ''
    aiFields.value = new Set()
    aiSuggestedAssigneeId.value = null
    aiAssigneeReason.value = null
    aiSuggestions.value = []
    aiConfidence.value = 0
  }
})

// Quick-start chips
const quickChips = [
  'Review campaign performance for...',
  'Create social media assets for...',
  'Update client on project status...',
  'Schedule meeting to discuss...'
]

function useChip(chip: string) {
  aiInput.value = chip
  const textarea = document.querySelector('[data-ai-input]') as HTMLTextAreaElement
  textarea?.focus()
}

// AI assist
async function getAiSuggestion() {
  if (!aiInput.value.trim()) return

  aiLoading.value = true
  aiFields.value = new Set()
  aiSuggestions.value = []

  try {
    const result = await $fetch('/api/agency/ai/task-assist', {
      method: 'POST',
      body: {
        description: aiInput.value.trim(),
        boardId: props.departmentId,
        workspaceId: props.workspaceId,
        boardName: props.boardName
      }
    }) as any

    // Apply AI suggestions to form
    if (result.title) {
      form.value.title = result.title
      aiFields.value.add('title')
    }
    if (result.description) {
      form.value.description = result.description
      aiFields.value.add('description')
    }
    if (result.priority && result.priority !== 'medium') {
      form.value.priority = result.priority
      aiFields.value.add('priority')
    }
    if (result.assigneeId) {
      form.value.assigneeId = result.assigneeId
      aiSuggestedAssigneeId.value = result.assigneeId
      aiAssigneeReason.value = result.assigneeReason || null
      aiFields.value.add('assigneeId')
    }
    if (result.projectId) {
      form.value.projectId = result.projectId
      aiFields.value.add('projectId')
    }
    if (result.dueDate) {
      form.value.dueDate = result.dueDate
      aiFields.value.add('dueDate')
    }
    if (result.startDate) {
      form.value.startDate = result.startDate
      aiFields.value.add('startDate')
    }
    if (result.estimatedHours) {
      form.value.estimatedHours = result.estimatedHours
      aiFields.value.add('estimatedHours')
    }
    if (result.statusId) {
      form.value.statusId = result.statusId
      aiFields.value.add('statusId')
    }

    aiConfidence.value = result.confidence || 0
    aiSuggestions.value = result.suggestions || []
  } catch (error: any) {
    toast.add({
      title: 'AI suggestion failed',
      description: error?.data?.statusMessage || 'Please fill in the fields manually.',
      color: 'warning'
    })
  } finally {
    aiLoading.value = false
  }
}

function handleAiKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    getAiSuggestion()
  }
}

function toggleLabel(labelId: string) {
  const idx = form.value.labels.indexOf(labelId)
  if (idx === -1) {
    form.value.labels.push(labelId)
  } else {
    form.value.labels.splice(idx, 1)
  }
}

function isAiField(field: string) {
  return aiFields.value.has(field)
}

async function createTask() {
  if (!form.value.title.trim()) {
    toast.add({ title: 'Task title is required', color: 'error' })
    return
  }

  creating.value = true

  try {
    await $fetch('/api/agency/tasks', {
      method: 'POST',
      body: {
        departmentId: props.departmentId,
        title: form.value.title.trim(),
        description: form.value.description?.trim() || undefined,
        projectId: form.value.projectId || undefined,
        statusId: form.value.statusId || undefined,
        priority: form.value.priority,
        assigneeId: form.value.assigneeId || undefined,
        dueDate: form.value.dueDate || undefined,
        startDate: form.value.startDate || undefined,
        estimatedHours: form.value.estimatedHours || undefined,
        labels: form.value.labels.length > 0 ? form.value.labels : undefined
      }
    })

    toast.add({ title: 'Task created successfully', color: 'success' })
    isOpen.value = false
    emit('created')
  } catch (error: any) {
    toast.add({
      title: error?.data?.statusMessage || 'Failed to create task',
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <UCard class="w-full max-w-2xl">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Create Task</h3>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="sm"
              @click="isOpen = false"
            />
          </div>
        </template>

        <div class="space-y-5">
          <!-- Zone A: AI Input -->
          <div class="rounded-lg border border-default bg-elevated/30 p-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary" />
              <span class="text-sm font-medium">AI Assist</span>
              <span class="text-xs text-muted">(optional)</span>
            </div>

            <UTextarea
              v-model="aiInput"
              data-ai-input
              placeholder="Describe what needs to be done... e.g. 'Create a campaign review for Acme, high priority, assign to someone in marketing, due next Friday'"
              :rows="2"
              @keydown="handleAiKeydown"
            />

            <div class="flex items-center justify-between mt-2">
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="chip in quickChips"
                  :key="chip"
                  class="text-[11px] px-2 py-0.5 rounded-full border border-default text-muted hover:text-default hover:bg-elevated transition-colors"
                  @click="useChip(chip)"
                >
                  {{ chip.slice(0, 30) }}...
                </button>
              </div>
              <UButton
                size="xs"
                :loading="aiLoading"
                :disabled="!aiInput.trim()"
                icon="i-lucide-sparkles"
                @click="getAiSuggestion"
              >
                Suggest
              </UButton>
            </div>

            <!-- AI suggestions / tips -->
            <div v-if="aiSuggestions.length" class="mt-2 space-y-1">
              <p
                v-for="(suggestion, i) in aiSuggestions"
                :key="i"
                class="text-xs text-muted flex items-start gap-1"
              >
                <UIcon name="i-lucide-lightbulb" class="w-3 h-3 mt-0.5 text-yellow-500 flex-shrink-0" />
                {{ suggestion }}
              </p>
            </div>

            <div v-if="aiConfidence > 0" class="mt-2">
              <div class="flex items-center gap-2">
                <div class="flex-1 h-1 bg-default/30 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="aiConfidence > 0.7 ? 'bg-green-500' : aiConfidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'"
                    :style="{ width: `${aiConfidence * 100}%` }"
                  />
                </div>
                <span class="text-[10px] text-muted">{{ Math.round(aiConfidence * 100) }}% confident</span>
              </div>
            </div>
          </div>

          <!-- Zone B: Form Fields -->
          <form class="space-y-4" @submit.prevent="createTask">
            <!-- Title -->
            <UFormField label="Title" required>
              <template #label>
                <span class="flex items-center gap-1">
                  Title
                  <UIcon v-if="isAiField('title')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                </span>
              </template>
              <UInput
                v-model="form.title"
                placeholder="Enter task title..."
                autofocus
              />
            </UFormField>

            <!-- Description -->
            <UFormField label="Description">
              <template #label>
                <span class="flex items-center gap-1">
                  Description
                  <UIcon v-if="isAiField('description')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                </span>
              </template>
              <UTextarea
                v-model="form.description"
                placeholder="Task description..."
                :rows="3"
              />
            </UFormField>

            <!-- Status & Priority -->
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Status">
                <template #label>
                  <span class="flex items-center gap-1">
                    Status
                    <UIcon v-if="isAiField('statusId')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <USelectMenu
                  v-model="form.statusId"
                  :items="statuses.map(s => ({ label: s.name, value: s.id, color: s.color }))"
                  placeholder="Select status..."
                  value-key="value"
                >
                  <template #item="{ item }">
                    <span
                      class="w-2 h-2 rounded-full mr-2"
                      :style="{ backgroundColor: item.color }"
                    />
                    {{ item.label }}
                  </template>
                </USelectMenu>
              </UFormField>

              <UFormField label="Priority">
                <template #label>
                  <span class="flex items-center gap-1">
                    Priority
                    <UIcon v-if="isAiField('priority')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <USelectMenu
                  v-model="form.priority"
                  :items="priorityOptions"
                  value-key="value"
                />
              </UFormField>
            </div>

            <!-- Assignee & Project -->
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Assignee">
                <template #label>
                  <span class="flex items-center gap-1">
                    Assignee
                    <UIcon v-if="isAiField('assigneeId')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <WorkflowAssigneePicker
                  v-model="form.assigneeId"
                  :members="teamMembers"
                  :ai-suggested-id="aiSuggestedAssigneeId"
                  :ai-reason="aiAssigneeReason"
                />
              </UFormField>

              <UFormField label="Project">
                <template #label>
                  <span class="flex items-center gap-1">
                    Project
                    <UIcon v-if="isAiField('projectId')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <USelectMenu
                  v-model="form.projectId"
                  :items="projects.map(p => ({ label: p.name, value: p.id }))"
                  placeholder="No project"
                  value-key="value"
                />
              </UFormField>
            </div>

            <!-- Dates & Hours -->
            <div class="grid grid-cols-3 gap-4">
              <UFormField label="Due Date">
                <template #label>
                  <span class="flex items-center gap-1">
                    Due Date
                    <UIcon v-if="isAiField('dueDate')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <UInput v-model="form.dueDate" type="date" />
              </UFormField>

              <UFormField label="Start Date">
                <template #label>
                  <span class="flex items-center gap-1">
                    Start Date
                    <UIcon v-if="isAiField('startDate')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <UInput v-model="form.startDate" type="date" />
              </UFormField>

              <UFormField label="Est. Hours">
                <template #label>
                  <span class="flex items-center gap-1">
                    Est. Hours
                    <UIcon v-if="isAiField('estimatedHours')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                  </span>
                </template>
                <UInput
                  v-model.number="form.estimatedHours"
                  type="number"
                  placeholder="0"
                  :min="0"
                  :step="0.5"
                />
              </UFormField>
            </div>

            <!-- Labels -->
            <UFormField v-if="labels.length > 0" label="Labels">
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="label in labels"
                  :key="label.id"
                  type="button"
                  class="px-2 py-1 text-xs rounded-full border transition-all"
                  :class="form.labels.includes(label.id)
                    ? 'border-transparent'
                    : 'border-gray-200 dark:border-gray-700 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800'"
                  :style="form.labels.includes(label.id)
                    ? { backgroundColor: label.color + '30', color: label.color, borderColor: label.color }
                    : {}"
                  @click="toggleLabel(label.id)"
                >
                  {{ label.name }}
                </button>
              </div>
            </UFormField>
          </form>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="isOpen = false">
              Cancel
            </UButton>
            <UButton
              :loading="creating"
              @click="createTask"
            >
              Create Task
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
