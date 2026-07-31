<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import type { CalendarDate, DateValue } from '@internationalized/date'

interface TaskAssistResponse {
  title?: string
  description?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  assigneeId?: string
  assigneeReason?: string
  projectId?: string
  dueDate?: string
  startDate?: string
  estimatedHours?: number
  statusId?: string
  confidence?: number
  suggestions?: string[]
}

const props = defineProps<{
  open: boolean
  statuses: Array<{ id: string, name: string, color: string, category?: string }>
  teamMembers: Array<{ id: string, name: string, email?: string, role?: string, avatar?: string, active_task_count?: number }>
  projects: Array<{ id: string, name: string, clientId?: string, client_name?: string }>
  labels: Array<{ id: string, name: string, color: string }>
  departmentId?: string
  workspaceId?: string
  boardName?: string
  initialStatusId?: string
  initialDate?: string
  initialTitle?: string
  initialDescription?: string
  initialProjectId?: string
  projectRequired?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [task: { id: string, title: string }]
}>()

const toast = useToast()

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val)
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

function errorMessage(error: unknown, fallback: string): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || fallback
}

// Reset when modal opens
watch(isOpen, (val) => {
  if (val) {
    form.value = {
      title: props.initialTitle || '',
      description: props.initialDescription || '',
      projectId: props.initialProjectId,
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
}, { immediate: true })

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
    const result = await $fetch<TaskAssistResponse>('/api/agency/ai/task-assist', {
      method: 'POST',
      body: {
        description: aiInput.value.trim(),
        boardId: props.departmentId,
        workspaceId: props.workspaceId,
        boardName: props.boardName
      }
    })

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
    if (
      result.projectId
      && (
        !props.projectRequired
        || props.projects.some(project => project.id === result.projectId)
      )
    ) {
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
  } catch (error: unknown) {
    toast.add({
      title: 'AI suggestion failed',
      description: errorMessage(error, 'Please fill in the fields manually.'),
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

// Date picker helpers — bridge between ISO YYYY-MM-DD strings and CalendarDate
function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try {
    return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso)
  } catch {
    return null
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(iso: string): string {
  if (!iso) return ''
  const cd = toCalendarDate(iso)
  if (!cd) return ''
  return dateFormatter.format(new Date((cd as CalendarDate).year, (cd as CalendarDate).month - 1, (cd as CalendarDate).day))
}

const startDateModel = computed({
  get: () => toCalendarDate(form.value.startDate),
  set: (v) => { form.value.startDate = v ? v.toString() : '' }
})

const dueDateModel = computed({
  get: () => toCalendarDate(form.value.dueDate),
  set: (v) => { form.value.dueDate = v ? v.toString() : '' }
})

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
  if (props.projectRequired && !form.value.projectId) {
    toast.add({
      title: 'Project is required',
      description: 'Choose the client project that should own this task.',
      color: 'error'
    })
    return
  }

  creating.value = true

  try {
    const task = await $fetch<{ id: string, title: string }>('/api/agency/tasks', {
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
    emit('created', { id: task.id, title: task.title })
  } catch (error: unknown) {
    toast.add({
      title: errorMessage(error, 'Failed to create task'),
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
            <h3 class="text-lg font-semibold">
              Create Task
            </h3>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="sm"
              @click="isOpen = false"
            />
          </div>
        </template>

        <div class="space-y-6">
          <!-- Zone A: AI Input -->
          <div class="rounded-lg border border-default bg-elevated/30 p-3">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary" />
              <span class="text-sm font-medium">AI Assist</span>
              <span class="text-xs text-muted">(optional)</span>
            </div>

            <UTextarea
              v-model="aiInput"
              data-ai-input
              class="w-full"
              :ui="{ base: 'w-full' }"
              placeholder="Describe what needs to be done — e.g. 'Campaign review for Acme, high priority, marketing lead, due next Friday'"
              :rows="2"
              @keydown="handleAiKeydown"
            />

            <div class="flex flex-wrap gap-1.5 mt-2">
              <UButton
                v-for="chip in quickChips"
                :key="chip"
                type="button"
                :label="chip"
                size="xs"
                color="neutral"
                variant="soft"
                @click="useChip(chip)"
              />
            </div>

            <div class="flex justify-end mt-3">
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
          <form class="@container space-y-6" @submit.prevent="createTask">
            <!-- Section: Details -->
            <div class="space-y-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Details
              </p>

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
                  class="w-full"
                  :ui="{ base: 'w-full' }"
                  placeholder="What needs to be done?"
                  autofocus
                  data-testid="task-create-title"
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
                  class="w-full"
                  :ui="{ base: 'w-full' }"
                  placeholder="Add context, links, or acceptance criteria…"
                  :rows="4"
                  data-testid="task-create-description"
                />
              </UFormField>
            </div>

            <!-- Section: Assignment -->
            <div class="space-y-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Assignment
              </p>

              <!-- Status & Priority -->
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
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
                    class="w-full"
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
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Assignee & Project -->
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
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
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Project" :required="projectRequired">
                  <template #label>
                    <span class="flex items-center gap-1">
                      Project
                      <UIcon v-if="isAiField('projectId')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                    </span>
                  </template>
                  <USelectMenu
                    v-model="form.projectId"
                    :items="projects.map(p => ({ label: p.name, value: p.id }))"
                    :placeholder="projectRequired ? 'Choose a project' : 'No project'"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <!-- Section: Schedule -->
            <div class="space-y-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Schedule
              </p>

              <!-- Dates & Hours -->
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-3">
                <UFormField label="Start Date">
                  <template #label>
                    <span class="flex items-center gap-1">
                      Start Date
                      <UIcon v-if="isAiField('startDate')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                    </span>
                  </template>
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-calendar"
                      class="w-full justify-start font-normal"
                      :class="!form.startDate && 'text-muted'"
                    >
                      {{ formatDate(form.startDate) || 'Pick start date' }}
                    </UButton>
                    <template #content>
                      <UCalendar v-model="startDateModel" class="p-2" />
                      <div v-if="form.startDate" class="border-t border-default p-2 flex justify-end">
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          @click="form.startDate = ''"
                        >
                          Clear
                        </UButton>
                      </div>
                    </template>
                  </UPopover>
                </UFormField>

                <UFormField label="Due Date">
                  <template #label>
                    <span class="flex items-center gap-1">
                      Due Date
                      <UIcon v-if="isAiField('dueDate')" name="i-lucide-sparkles" class="w-3 h-3 text-primary" />
                    </span>
                  </template>
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-calendar"
                      class="w-full justify-start font-normal"
                      :class="!form.dueDate && 'text-muted'"
                    >
                      {{ formatDate(form.dueDate) || 'Pick due date' }}
                    </UButton>
                    <template #content>
                      <UCalendar v-model="dueDateModel" class="p-2" />
                      <div v-if="form.dueDate" class="border-t border-default p-2 flex justify-end">
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          @click="form.dueDate = ''"
                        >
                          Clear
                        </UButton>
                      </div>
                    </template>
                  </UPopover>
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
                    class="w-full"
                    :ui="{ base: 'w-full' }"
                  >
                    <template #trailing>
                      <span class="text-xs text-muted">h</span>
                    </template>
                  </UInput>
                </UFormField>
              </div>
            </div>

            <!-- Labels -->
            <UFormField v-if="labels.length > 0" label="Labels">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="label in labels"
                  :key="label.id"
                  type="button"
                  :label="label.name"
                  size="xs"
                  color="neutral"
                  :variant="form.labels.includes(label.id) ? 'soft' : 'outline'"
                  :style="form.labels.includes(label.id)
                    ? {
                      backgroundColor: `color-mix(in srgb, ${label.color} 18%, transparent)`,
                      color: label.color,
                      borderColor: label.color
                    }
                    : {}"
                  @click="toggleLabel(label.id)"
                />
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
              data-testid="task-create-submit"
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
