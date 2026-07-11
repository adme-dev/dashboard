<script setup lang="ts">
/**
 * In-chat confirmation card for an AI-proposed action (Option B). The assistant only PROPOSES; the
 * user confirms here, which calls the confirm-action endpoint that executes the real write. The card
 * shape is driven by `proposal.toolName`:
 *   - create_task            → task summary (board/project/assignee/due)
 *   - propose_budget_change  → RICH confirm: current→proposed/day, %, counter-model note, rollback;
 *                              sends richConfirmAck so the server's rich_confirm gate lets it through
 *   - propose_schedule_post  → social post summary (client / status / content)
 *   - propose_budget_alert   → budget-alert summary (client / severity / threshold)
 *   - anything else          → generic key/value summary
 */
interface ProposedAction {
  proposalId: string
  toolName?: string
  resolved: Record<string, any>
}

const props = defineProps<{ conversationId: string, proposal: ProposedAction }>()
const emit = defineEmits<{ confirmed: [resultRef: string], cancelled: [] }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const status = ref<'idle' | 'submitting' | 'done' | 'cancelled'>('idle')
const errorMsg = ref('')

const r = computed(() => props.proposal.resolved ?? {})
const toolName = computed(() => props.proposal.toolName ?? 'create_task')
const isBudgetChange = computed(() => toolName.value === 'propose_budget_change')
// rich_confirm tools (high-risk) must send richConfirmAck so the server's gate lets them through.
// Keep in sync with the server's rich_confirm tools (toolRegistry effectiveRiskTier).
const RICH_CONFIRM_TOOLS = new Set(['propose_budget_change', 'propose_eom_generate'])
const isRichConfirm = computed(() => RICH_CONFIRM_TOOLS.has(toolName.value))

const fmtMoney = (n: unknown) => (typeof n === 'number' ? `$${n.toLocaleString()}` : String(n ?? ''))
function formatDue(d?: string | null): string | null {
  if (!d) return null
  const parsed = new Date(d)
  return Number.isNaN(+parsed) ? d : parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// Per-tool presentation: header icon/label + the confirm button verb. Budget change is rendered
// with a dedicated rich body below rather than the generic meta list.
const view = computed(() => {
  switch (toolName.value) {
    case 'propose_budget_change':
      return { icon: 'i-lucide-dollar-sign', label: 'Proposed budget change · needs your explicit confirmation', cta: 'Confirm budget change', doneLabel: 'Budget change planned' }
    case 'propose_schedule_post':
      return { icon: 'i-lucide-calendar-clock', label: 'Proposed social post · awaiting your confirmation', cta: 'Confirm post', doneLabel: 'Post created' }
    case 'propose_budget_alert':
      return { icon: 'i-lucide-bell-ring', label: 'Proposed budget alert · awaiting your confirmation', cta: 'Confirm alert', doneLabel: 'Alert created' }
    case 'propose_knowledge_article':
      return { icon: 'i-lucide-book-plus', label: 'Proposed knowledge draft · awaiting your confirmation', cta: 'Save draft', doneLabel: 'Draft saved for review' }
    case 'propose_eom_generate':
      return { icon: 'i-lucide-file-stack', label: 'Proposed EOM invoice run · needs your explicit confirmation', cta: 'Generate EOM run', doneLabel: 'EOM run generated' }
    case 'propose_team_memory':
      return { icon: 'i-lucide-users', label: 'Add to your team\'s shared memory · awaiting your confirmation', cta: 'Add to team memory', doneLabel: 'Added to team memory' }
    default:
      return { icon: 'i-lucide-list-todo', label: 'Proposed task · awaiting your confirmation', cta: 'Create task', doneLabel: 'Task created' }
  }
})

// Generic title + meta rows for the non-rich cards.
const title = computed(() => {
  switch (toolName.value) {
    case 'propose_schedule_post': return r.value.content || 'Social post'
    case 'propose_team_memory': return r.value.content || 'Team memory'
    case 'propose_budget_alert': return r.value.title || 'Budget alert'
    default: return r.value.title || 'Action'
  }
})
const meta = computed(() => {
  const rows: Array<{ label: string, value: any }> = []
  switch (toolName.value) {
    case 'propose_schedule_post':
      rows.push({ label: 'Client', value: r.value.clientName })
      rows.push({ label: 'Status', value: r.value.status })
      rows.push({ label: 'Platforms', value: Array.isArray(r.value.platforms) && r.value.platforms.length ? r.value.platforms.join(', ') : null })
      rows.push({ label: 'When', value: formatDue(r.value.scheduledAt) })
      break
    case 'propose_budget_alert':
      rows.push({ label: 'Client', value: r.value.clientName })
      rows.push({ label: 'Severity', value: r.value.severity })
      rows.push({ label: 'Type', value: r.value.alertType })
      rows.push({ label: 'Threshold', value: typeof r.value.thresholdValue === 'number' ? r.value.thresholdValue : null })
      break
    case 'propose_eom_generate':
      rows.push({ label: 'Month', value: r.value.month })
      rows.push({ label: 'Year', value: r.value.year })
      rows.push({ label: 'Note', value: 'Draft run — does not push to Xero' })
      break
    case 'propose_team_memory':
      rows.push({ label: 'Department', value: r.value.departmentName })
      rows.push({ label: 'Type', value: r.value.memType })
      break
    case 'propose_knowledge_article':
      rows.push({ label: 'Category', value: r.value.category })
      rows.push({ label: 'Visibility', value: 'Draft — needs review before it’s searchable' })
      break
    default: // create_task
      rows.push({ label: 'Board', value: r.value.departmentName })
      rows.push({ label: 'Project', value: r.value.projectName })
      rows.push({ label: 'Assignee', value: r.value.assigneeName })
      rows.push({ label: 'Due', value: formatDue(r.value.dueDate) })
  }
  return rows.filter(m => m.value != null && m.value !== '')
})

// Rich budget-change fields.
const sanity = computed(() => r.value.sanityCheck as { sane?: boolean, concern?: string | null } | undefined)
const sanityConcern = computed(() => (sanity.value && sanity.value.sane === false && sanity.value.concern) ? sanity.value.concern : null)

async function confirm() {
  if (status.value === 'submitting' || status.value === 'done') return
  status.value = 'submitting'
  errorMsg.value = ''
  try {
    const res = await apiFetch<{ ok: boolean, taskId?: string, resultRef?: string, error?: string, requiresRichConfirm?: boolean }>(
      `/api/agency/ai/chat/conversations/${props.conversationId}/confirm-action`,
      // rich_confirm writes (budget change) must send the explicit acknowledgement the server gate requires.
      { method: 'POST', body: { proposalId: props.proposal.proposalId, ...(isRichConfirm.value ? { richConfirmAck: true } : {}) } },
    )
    const ref = res.resultRef || res.taskId
    if (res.ok && ref) {
      status.value = 'done'
      toast.add({ title: view.value.doneLabel, color: 'success' })
      emit('confirmed', ref)
    } else {
      status.value = 'idle'
      errorMsg.value = res.error || 'Could not complete the action.'
      toast.add({ title: 'Could not complete the action', description: errorMsg.value, color: 'error' })
    }
  } catch (e: any) {
    status.value = 'idle'
    errorMsg.value = e?.data?.statusMessage || e?.message || 'Something went wrong.'
    toast.add({ title: 'Could not complete the action', description: errorMsg.value, color: 'error' })
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
    :class="status === 'done' ? 'border-l-2 border-l-success' : status === 'cancelled' ? 'opacity-60' : isRichConfirm ? 'border-l-2 border-l-error' : 'border-l-2 border-l-warning'"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 pt-3">
      <span
        class="flex size-6 items-center justify-center rounded-md"
        :class="isBudgetChange ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'"
      >
        <UIcon :name="view.icon" class="size-3.5" />
      </span>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">
        <template v-if="status === 'done'">{{ view.doneLabel }}</template>
        <template v-else-if="status === 'cancelled'">Proposal dismissed</template>
        <template v-else>{{ view.label }}</template>
      </span>
    </div>

    <!-- Body: rich budget-change layout -->
    <div v-if="isBudgetChange" class="px-4 pb-3 pt-2">
      <p class="text-sm font-medium text-highlighted">{{ r.campaignName }}<span v-if="r.platform" class="ml-1 text-xs font-normal text-muted">· {{ r.platform }}</span></p>

      <div class="mt-2.5 flex items-center gap-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted">Current</p>
          <p class="text-sm text-default">{{ fmtMoney(r.currentDailyBudget) }}<span class="text-xs text-muted">/day</span></p>
        </div>
        <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted">Proposed</p>
          <p class="text-sm font-semibold text-highlighted">{{ fmtMoney(r.newDailyBudget) }}<span class="text-xs text-muted">/day</span></p>
        </div>
        <UBadge
          v-if="typeof r.pctChange === 'number'"
          :color="r.pctChange >= 0 ? 'warning' : 'success'" variant="soft" size="sm" class="ml-auto"
        >
          {{ r.pctChange >= 0 ? '+' : '' }}{{ r.pctChange }}%
        </UBadge>
      </div>

      <p v-if="r.reason" class="mt-2.5 text-xs text-muted">{{ r.reason }}</p>

      <!-- Counter-model advisory (never blocks; just warns) -->
      <UAlert
        v-if="sanityConcern"
        class="mt-3" color="warning" variant="soft" icon="i-lucide-triangle-alert"
        :title="'Sanity check'" :description="sanityConcern"
      />

      <p class="mt-3 flex items-center gap-1 text-[11px] text-muted">
        <UIcon name="i-lucide-undo-2" class="size-3" />
        Applies only after approval in the spend review — reverts to {{ fmtMoney(r.currentDailyBudget) }}/day anytime. Nothing changes on the platform yet.
      </p>

      <p v-if="errorMsg" class="mt-2 text-xs text-error">{{ errorMsg }}</p>
    </div>

    <!-- Body: generic layout (task / post / alert) -->
    <div v-else class="px-4 pb-3 pt-2">
      <p class="text-sm font-medium text-highlighted line-clamp-2">{{ title }}</p>

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
        :color="isBudgetChange ? 'error' : 'primary'" size="sm" icon="i-lucide-check"
        :loading="status === 'submitting'" @click="confirm"
      >
        {{ view.cta }}
      </UButton>
    </div>
  </div>
</template>
