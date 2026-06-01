<script setup lang="ts">
import type { CrmTask, CrmTaskFilters } from '~/types/crm'

const props = withDefaults(defineProps<{
  clientId: string | null
  targetType?: 'person' | 'company' | 'opportunity'
  targetId?: string | null
  showFilters?: boolean
  title?: string
}>(), { showFilters: false, title: 'Tasks' })

const clientId = toRef(props, 'clientId')
const statusFilter = ref<string>('all')

const filters = computed<CrmTaskFilters>(() => ({
  target_type: props.targetType,
  target_id: props.targetId ?? undefined,
  status: statusFilter.value === 'all' ? undefined : statusFilter.value,
  page_size: 200,
}))

const { tasks, total, pending, create, update, complete, remove } = useCrmTasks(clientId, filters)

const statusItems = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const priorityColor: Record<string, string> = { low: 'neutral', medium: 'primary', high: 'warning', urgent: 'error' }
const statusColor: Record<string, string> = {
  pending: 'neutral', overdue: 'error', in_progress: 'info', completed: 'success', cancelled: 'neutral',
}
const typeIcon: Record<string, string> = {
  call: 'i-lucide-phone', email: 'i-lucide-mail', sms: 'i-lucide-message-square',
  meeting: 'i-lucide-users', follow_up: 'i-lucide-rotate-cw', general: 'i-lucide-circle-dot',
}
const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' })
function fmtDue(iso: string | null) { return iso ? dateFmt.format(new Date(iso)) : '' }

const toast = useToast()
const showForm = ref(false)
const editing = ref<CrmTask | null>(null)
const confirmDelete = ref<CrmTask | null>(null)

function openCreate() { editing.value = null; showForm.value = true }
function openEdit(t: CrmTask) { editing.value = t; showForm.value = true }

async function onSubmit(payload: Record<string, unknown>) {
  try {
    if (editing.value) await update(editing.value.id, payload as Partial<CrmTask>)
    else await create({ ...payload, target_type: props.targetType, target_id: props.targetId } as Partial<CrmTask>)
    showForm.value = false
    toast.add({ title: editing.value ? 'Task updated' : 'Task created', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not save task', description: (e as Error)?.message, color: 'error' })
  }
}
async function onComplete(t: CrmTask) {
  try { await complete(t.id); toast.add({ title: 'Task completed', color: 'success' }) }
  catch (e: unknown) { toast.add({ title: 'Could not complete task', description: (e as Error)?.message, color: 'error' }) }
}
async function doDelete() {
  if (!confirmDelete.value) return
  try { await remove(confirmDelete.value.id); toast.add({ title: 'Task deleted', color: 'success' }) }
  catch (e: unknown) { toast.add({ title: 'Could not delete task', description: (e as Error)?.message, color: 'error' }) }
  finally { confirmDelete.value = null }
}

function rowMenu(t: CrmTask) {
  return [[
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(t) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { confirmDelete.value = t } },
  ]]
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold text-highlighted">{{ title }}</h3>
        <UBadge v-if="total" color="neutral" variant="subtle" size="sm">{{ total }}</UBadge>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-if="showFilters"
          v-model="statusFilter"
          :items="statusItems"
          value-key="value"
          size="sm"
          class="w-40"
        />
        <UButton size="sm" icon="i-lucide-plus" @click="openCreate">Add task</UButton>
      </div>
    </div>

    <div v-if="pending && !tasks.length" class="py-6 text-center text-sm text-muted">Loading…</div>
    <div v-else-if="!tasks.length" class="rounded-lg border border-dashed border-default py-8 text-center">
      <UIcon name="i-lucide-check-check" class="mx-auto mb-2 size-6 text-muted" />
      <p class="text-sm text-muted">No tasks yet</p>
    </div>

    <ul v-else class="space-y-1.5">
      <li
        v-for="t in tasks"
        :key="t.id"
        class="group flex items-start gap-3 rounded-lg border border-default bg-elevated/40 px-3 py-2.5"
      >
        <UButton
          :icon="t.status === 'completed' ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
          :color="t.status === 'completed' ? 'success' : 'neutral'"
          variant="ghost"
          size="xs"
          class="mt-0.5"
          :disabled="t.status === 'completed' || t.status === 'cancelled'"
          @click="onComplete(t)"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <UIcon :name="typeIcon[t.task_type] || 'i-lucide-circle-dot'" class="size-3.5 shrink-0 text-muted" />
            <span
              class="truncate text-sm"
              :class="t.status === 'completed' ? 'text-muted line-through' : 'text-highlighted'"
            >{{ t.title }}</span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5">
            <UBadge :color="(statusColor[t.derived_status || t.status] as any)" variant="subtle" size="sm">
              {{ (t.derived_status || t.status).replace('_', ' ') }}
            </UBadge>
            <UBadge :color="(priorityColor[t.priority] as any)" variant="soft" size="sm">{{ t.priority }}</UBadge>
            <span
              v-if="t.due_at"
              class="inline-flex items-center gap-1 text-xs"
              :class="t.derived_status === 'overdue' ? 'text-error font-medium' : 'text-muted'"
            >
              <UIcon name="i-lucide-calendar" class="size-3" />{{ fmtDue(t.due_at) }}
            </span>
          </div>
        </div>
        <UDropdownMenu :items="rowMenu(t)">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="xs"
            class="opacity-0 group-hover:opacity-100"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <UModal v-model:open="showForm" :title="editing ? 'Edit task' : 'New task'">
      <template #body>
        <CrmTaskForm :task="editing" @submit="onSubmit" @cancel="showForm = false" />
      </template>
    </UModal>

    <UModal v-model:open="confirmDelete" title="Delete task">
      <template #body>
        <p class="text-sm text-muted">
          Delete “{{ confirmDelete?.title }}”? This can't be undone.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="confirmDelete = null">Cancel</UButton>
          <UButton color="error" @click="doDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
