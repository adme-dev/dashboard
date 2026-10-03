<script setup lang="ts">
const props = defineProps<{
  sourceType: 'quote-line-item' | 'brief'
  prefillTitle?: string
  prefillDescription?: string
  prefillEstimatedHours?: number | null
  prefillProjectId?: string | null
  quoteLineItemId?: string | null
  briefId?: string | null
  sourceLabel: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  created: [task: { id: string }]
}>()

const { user } = useAuth()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

// Form state
const selectedBoard = ref<string>('_none')
const title = ref('')
const description = ref('')
const assignee = ref('_none')
const priority = ref('medium')
const estimatedHours = ref<number | null>(null)
const creating = ref(false)

// Lazy-loaded data
const boardsLoaded = ref(false)
const membersLoaded = ref(false)
interface NamedOption { id: string, name: string }
const boards = ref<NamedOption[]>([])
const members = ref<NamedOption[]>([])

// Reset form when modal opens
watch(open, (isOpen) => {
  if (isOpen) {
    title.value = props.prefillTitle || ''
    description.value = props.prefillDescription || ''
    estimatedHours.value = props.prefillEstimatedHours ?? null
    selectedBoard.value = '_none'
    assignee.value = '_none'
    priority.value = 'medium'
    creating.value = false

    if (!boardsLoaded.value) fetchBoards()
    if (!membersLoaded.value) fetchMembers()
  }
})

async function fetchBoards() {
  try {
    const data = await apiFetch<NamedOption[] | { boards: NamedOption[] }>('/api/agency/boards')
    boards.value = Array.isArray(data) ? data : data?.boards || []
    boardsLoaded.value = true
  } catch { /* silent */ }
}

async function fetchMembers() {
  try {
    const data = await apiFetch<NamedOption[] | { members: NamedOption[] }>('/api/agency/team-members')
    members.value = Array.isArray(data) ? data : data?.members || []
    membersLoaded.value = true
  } catch { /* silent */ }
}

const boardOptions = computed(() => [
  { label: 'Select a board...', value: '_none' },
  ...boards.value.map(b => ({ label: b.name, value: b.id }))
])

const memberOptions = computed(() => [
  { label: 'Unassigned', value: '_none' },
  ...members.value.map(m => ({ label: m.name, value: m.id }))
])

const priorityOptions = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
]

const canCreate = computed(() =>
  selectedBoard.value !== '_none' && title.value.trim().length > 0
)

async function handleCreate() {
  if (!canCreate.value || creating.value) return
  creating.value = true

  try {
    const task = await apiFetch<{ id: string }>('/api/agency/tasks', {
      method: 'POST',
      body: {
        departmentId: selectedBoard.value,
        title: title.value.trim(),
        description: description.value.trim() || undefined,
        assigneeId: assignee.value !== '_none' ? assignee.value : undefined,
        priority: priority.value,
        estimatedHours: estimatedHours.value != null ? estimatedHours.value : undefined,
        projectId: props.prefillProjectId ?? undefined,
        reporterId: user.value?.id,
        quoteLineItemId: props.sourceType === 'quote-line-item' ? props.quoteLineItemId : undefined,
        briefId: props.sourceType === 'brief' ? props.briefId : undefined,
        budgetSource: props.sourceType === 'quote-line-item' ? 'quote' : 'brief'
      }
    })

    toast.add({ title: 'Task created', color: 'success' })
    emit('created', task)
    open.value = false
  } catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Failed to create task',
      description: error.data?.statusMessage || error.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="@container max-h-[85svh] overflow-y-auto p-6 space-y-5">
        <h3 class="text-lg font-semibold">
          Create Task
        </h3>

        <!-- Source context banner -->
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 text-sm">
          <UIcon
            :name="sourceType === 'quote-line-item' ? 'i-lucide-receipt' : 'i-lucide-file-text'"
            class="size-4 text-primary shrink-0"
          />
          <span class="text-muted truncate">{{ sourceLabel }}</span>
        </div>

        <!-- Form -->
        <div class="space-y-4">
          <UFormField label="Board" required>
            <USelectMenu
              v-model="selectedBoard"
              :items="boardOptions"
              value-key="value"
              placeholder="Select a board..."
              class="w-full"
            />
          </UFormField>

          <UFormField label="Title" required>
            <UInput
              v-model="title"
              placeholder="Task title"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Description" help="Include the deliverable, acceptance criteria and relevant links.">
            <UTextarea
              v-model="description"
              :rows="4"
              class="w-full"
              placeholder="What needs to be delivered?"
            />
          </UFormField>

          <div class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
            <UFormField label="Assignee">
              <USelectMenu
                v-model="assignee"
                :items="memberOptions"
                value-key="value"
                placeholder="Unassigned"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Priority">
              <USelectMenu
                v-model="priority"
                :items="priorityOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField label="Estimated Hours">
            <UInput
              v-model.number="estimatedHours"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 8"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" @click="open = false">
            Cancel
          </UButton>
          <UButton
            :loading="creating"
            :disabled="!canCreate"
            @click="handleCreate"
          >
            Create Task
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
