<script setup lang="ts">
/**
 * In-chat confirmation card for an AI-proposed action (Option B). The assistant only PROPOSES;
 * the user confirms here, which calls the confirm-action endpoint that executes the real write.
 */
interface ResolvedTask {
  title: string
  departmentName?: string | null
  projectName?: string | null
  assigneeName?: string | null
  dueDate?: string | null
  description?: string | null
}
interface ProposedAction {
  proposalId: string
  toolName?: string
  resolved: ResolvedTask
}

const props = defineProps<{ conversationId: string, proposal: ProposedAction }>()
const emit = defineEmits<{ confirmed: [taskId: string], cancelled: [] }>()

const toast = useToast()
const status = ref<'idle' | 'submitting' | 'done' | 'cancelled'>('idle')
const errorMsg = ref('')

const r = computed(() => props.proposal.resolved)

const meta = computed(() => [
  { label: 'Board', value: r.value.departmentName },
  { label: 'Project', value: r.value.projectName },
  { label: 'Assignee', value: r.value.assigneeName },
  { label: 'Due', value: formatDue(r.value.dueDate) },
].filter(m => m.value))

function formatDue(d?: string | null): string | null {
  if (!d) return null
  const parsed = new Date(d)
  return Number.isNaN(+parsed) ? d : parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

async function confirm() {
  if (status.value === 'submitting' || status.value === 'done') return
  status.value = 'submitting'
  errorMsg.value = ''
  try {
    const res = await $fetch<{ ok: boolean, taskId?: string, error?: string }>(
      `/api/agency/ai/chat/conversations/${props.conversationId}/confirm-action`,
      { method: 'POST', body: { proposalId: props.proposal.proposalId } },
    )
    if (res.ok && res.taskId) {
      status.value = 'done'
      toast.add({ title: 'Task created', description: r.value.title, color: 'success' })
      emit('confirmed', res.taskId)
    } else {
      status.value = 'idle'
      errorMsg.value = res.error || 'Could not create the task.'
      toast.add({ title: 'Could not create task', description: errorMsg.value, color: 'error' })
    }
  } catch (e: any) {
    status.value = 'idle'
    errorMsg.value = e?.data?.statusMessage || e?.message || 'Something went wrong.'
    toast.add({ title: 'Could not create task', description: errorMsg.value, color: 'error' })
  }
}

function cancel() {
  status.value = 'cancelled'
  emit('cancelled')
}
</script>

<template>
  <div
    class="my-2 max-w-md overflow-hidden rounded-xl border border-default bg-elevated/60 shadow-sm"
    :class="status === 'done' ? 'border-l-2 border-l-success' : status === 'cancelled' ? 'opacity-60' : 'border-l-2 border-l-warning'"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 pt-3">
      <span class="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <UIcon name="i-lucide-list-todo" class="size-3.5" />
      </span>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">
        <template v-if="status === 'done'">Task created</template>
        <template v-else-if="status === 'cancelled'">Proposal dismissed</template>
        <template v-else>Proposed task · awaiting your confirmation</template>
      </span>
    </div>

    <!-- Body -->
    <div class="px-4 pb-3 pt-2">
      <p class="text-sm font-medium text-highlighted">{{ r.title }}</p>

      <dl v-if="meta.length" class="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
        <div v-for="m in meta" :key="m.label" class="min-w-0">
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted">{{ m.label }}</dt>
          <dd class="truncate text-sm text-default">{{ m.value }}</dd>
        </div>
      </dl>

      <p v-if="r.description" class="mt-2.5 line-clamp-3 text-xs text-muted">{{ r.description }}</p>

      <p v-if="errorMsg" class="mt-2 text-xs text-error">{{ errorMsg }}</p>
    </div>

    <!-- Footer -->
    <div
      v-if="status !== 'done' && status !== 'cancelled'"
      class="flex items-center justify-end gap-2 border-t border-default bg-default/40 px-4 py-2.5"
    >
      <UButton color="neutral" variant="ghost" size="sm" :disabled="status === 'submitting'" @click="cancel">
        Cancel
      </UButton>
      <UButton
        color="primary" size="sm" icon="i-lucide-check"
        :loading="status === 'submitting'" @click="confirm"
      >
        Create task
      </UButton>
    </div>
  </div>
</template>
