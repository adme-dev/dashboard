<script setup lang="ts">
interface TemplateTask {
  id: string
  title: string
  description?: string | null
  defaultDepartmentId?: string | null
  priority?: string
  taskType?: string
  estimatedHours?: number | null
  startDayOffset?: number | null
  durationDays?: number | null
  dependsOnTaskIds?: string[] | null
  billable?: boolean
}
const props = defineProps<{
  templateId: string
  revision: string
  tasks: TemplateTask[]
  task?: TemplateTask | null
  defaultDepartmentId?: string | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const boards = ref<{ id: string, name: string }[]>([])
const saving = ref(false)
const loadingBoards = ref(false)
const formError = ref('')
const openedRevision = ref('')
const form = ref({ title: '', description: '', board: '_none', priority: 'medium', taskType: 'task', estimatedHours: null as number | string | null, startDayOffset: 0, durationDays: 1, dependencies: [] as string[], billable: false })
const boardOptions = computed(() => [{ label: 'Select a board', value: '_none' }, ...boards.value.map(board => ({ label: board.name, value: board.id }))])
const dependencyOptions = computed(() => props.tasks.filter(task => task.id !== props.task?.id).map(task => ({ label: task.title, value: task.id })))
watch(open, async (shown) => {
  if (!shown) return
  const task = props.task
  openedRevision.value = props.revision
  formError.value = ''
  form.value = {
    title: task?.title || '', description: task?.description || '', board: task?.defaultDepartmentId || props.defaultDepartmentId || '_none',
    priority: task?.priority || 'medium', taskType: task?.taskType || 'task', estimatedHours: task?.estimatedHours ?? null,
    startDayOffset: task?.startDayOffset ?? 0, durationDays: task?.durationDays ?? 1,
    dependencies: [...task?.dependsOnTaskIds || []], billable: task?.billable ?? false
  }
  loadingBoards.value = true
  try {
    const departments = await $fetch<{ id: string, name: string, isActive?: boolean }[]>('/api/agency/departments')
    boards.value = departments.filter(board => board.isActive !== false)
  } catch {
    formError.value = 'Unable to load boards. Close and reopen this form to try again.'
  } finally {
    loadingBoards.value = false
  }
}, { immediate: true })
async function save() {
  if (saving.value || !form.value.title.trim() || form.value.board === '_none') return
  saving.value = true
  formError.value = ''
  try {
    await $fetch(`/api/agency/templates/${props.templateId}/tasks`, {
      method: 'POST', body: {
        taskId: props.task?.id, expectedRevision: openedRevision.value,
        title: form.value.title.trim(), description: form.value.description,
        defaultDepartmentId: form.value.board, priority: form.value.priority, taskType: form.value.taskType,
        estimatedHours: form.value.estimatedHours === null || form.value.estimatedHours === '' ? null : Number(form.value.estimatedHours),
        startDayOffset: Number(form.value.startDayOffset), durationDays: Number(form.value.durationDays),
        dependsOnTaskIds: form.value.dependencies, billable: form.value.billable
      }
    })
    emit('saved')
    open.value = false
    toast.add({ title: 'Template task saved', color: 'success' })
  } catch (error: unknown) {
    const failure = error as { data?: { statusMessage?: string } }
    formError.value = failure.data?.statusMessage || 'Unable to save this task. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="task ? 'Edit template task' : 'Add template task'" description="Define the work and acceptance criteria once, then reuse them in each new job.">
    <template #body>
      <div class="@container space-y-4 max-h-[65svh] overflow-y-auto">
        <UAlert v-if="formError" color="error" :description="formError" />
        <UFormField label="Task title" required>
          <UInput v-model="form.title" class="w-full" placeholder="e.g. Review creative and copy" />
        </UFormField>
        <UFormField label="Instructions and acceptance criteria" help="Describe what must be delivered and how completion will be verified.">
          <UTextarea v-model="form.description" :rows="5" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
          <UFormField label="Board" required>
            <USelectMenu
              v-model="form.board"
              :items="boardOptions"
              value-key="value"
              :loading="loadingBoards"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Priority">
            <USelect v-model="form.priority" :items="['low', 'medium', 'high', 'urgent']" class="w-full" />
          </UFormField>
          <UFormField label="Task type">
            <USelect v-model="form.taskType" :items="['task', 'milestone', 'deliverable', 'review', 'approval']" class="w-full" />
          </UFormField>
          <UFormField label="Estimated hours">
            <UInput
              v-model="form.estimatedHours"
              type="number"
              min="0"
              step="0.5"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Start after (days)" help="Days after the project start date.">
            <UInput
              v-model="form.startDayOffset"
              type="number"
              min="0"
              step="1"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Duration (days)">
            <UInput
              v-model="form.durationDays"
              type="number"
              min="0"
              step="1"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField label="Prerequisite tasks" help="These tasks should finish before this work proceeds. Publishing approval is managed separately.">
          <USelectMenu
            v-model="form.dependencies"
            :items="dependencyOptions"
            value-key="value"
            multiple
            placeholder="No prerequisites"
            class="w-full"
          />
        </UFormField>
        <UCheckbox v-model="form.billable" label="Billable work" />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" :disabled="saving" @click="() => { open = false }">
          Cancel
        </UButton>
        <UButton :loading="saving" :disabled="!form.title.trim() || form.board === '_none' || loadingBoards" @click="save">
          Save task
        </UButton>
      </div>
    </template>
  </UModal>
</template>
