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
  created: [task: any]
}>()

const { user } = useAuth()
const toast = useToast()

// Form state
const selectedBoard = ref<string>('_none')
const title = ref('')
const assignee = ref('_none')
const priority = ref('medium')
const estimatedHours = ref<number | null>(null)
const creating = ref(false)

// Lazy-loaded data
const boardsLoaded = ref(false)
const membersLoaded = ref(false)
const boards = ref<any[]>([])
const members = ref<any[]>([])

// Reset form when modal opens
watch(open, (isOpen) => {
  if (isOpen) {
    title.value = props.prefillTitle || ''
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
    const data = await $fetch<any>('/api/agency/boards')
    boards.value = data?.boards || data || []
    boardsLoaded.value = true
  } catch { /* silent */ }
}

async function fetchMembers() {
  try {
    const data = await $fetch<any>('/api/agency/team-members')
    members.value = data?.members || data || []
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
  { label: 'Low', value: 'low' },
]

const canCreate = computed(() =>
  selectedBoard.value !== '_none' && title.value.trim().length > 0
)

async function handleCreate() {
  if (!canCreate.value) return
  creating.value = true

  try {
    const task = await $fetch('/api/agency/tasks', {
      method: 'POST',
      body: {
        departmentId: selectedBoard.value,
        title: title.value.trim(),
        assigneeId: assignee.value !== '_none' ? assignee.value : undefined,
        priority: priority.value,
        estimatedHours: estimatedHours.value != null ? estimatedHours.value : undefined,
        projectId: props.prefillProjectId ?? undefined,
        reporterId: user.value?.id,
        quoteLineItemId: props.sourceType === 'quote-line-item' ? props.quoteLineItemId : undefined,
        briefId: props.sourceType === 'brief' ? props.briefId : undefined,
        budgetSource: props.sourceType === 'quote-line-item' ? 'quote' : 'brief',
      }
    })

    toast.add({ title: 'Task created', color: 'success' })
    emit('created', task)
    open.value = false
  } catch (err: any) {
    toast.add({
      title: 'Failed to create task',
      description: err.data?.statusMessage || err.message,
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
      <div class="p-6 space-y-5">
        <h3 class="text-lg font-semibold">Create Task</h3>

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
          <div>
            <label class="block text-sm font-medium mb-1">Board <span class="text-red-500">*</span></label>
            <USelectMenu
              v-model="selectedBoard"
              :items="boardOptions"
              value-key="value"
              placeholder="Select a board..."
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Title <span class="text-red-500">*</span></label>
            <UInput
              v-model="title"
              placeholder="Task title"
              class="w-full"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Assignee</label>
              <USelectMenu
                v-model="assignee"
                :items="memberOptions"
                value-key="value"
                placeholder="Unassigned"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Priority</label>
              <USelectMenu
                v-model="priority"
                :items="priorityOptions"
                value-key="value"
                class="w-full"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Estimated Hours</label>
            <UInput
              v-model.number="estimatedHours"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 8"
              class="w-full"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" @click="open = false">Cancel</UButton>
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
