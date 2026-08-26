<script setup lang="ts">
import { useSocialInbox } from '~/composables/useSocialInbox'
import { useSocialInboxRealtime } from '~/composables/useSocialInboxRealtime'
import type {
  SocialConversation,
  SocialInboxAccountHealth,
  SocialInboxAiActionInput,
  SocialInboxAiActionProposal,
  SocialInboxAiTriageResult,
  SocialInboxCaseTimelineItem,
  SocialInboxPriority,
  SocialInboxSyncResult,
  SocialMessage
} from '~/types'
import { getSocialInboxCapabilities } from '~/utils/socialInboxCapabilities'
import { formatSocialInboxSyncSummary, getSocialInboxSyncIssueCount } from '~/utils/socialInboxSync'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

interface AgencyClientOption {
  id: string
  name: string
}

type AgencyClientsResponse = AgencyClientOption[] | { clients?: AgencyClientOption[] }

function fetchErrorDescription(error: unknown) {
  const e = error as { data?: { statusMessage?: string }, message?: string }
  return e.data?.statusMessage || e.message
}

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown>; headers?: Record<string, string> }
) => Promise<T>
const clientsData = ref<AgencyClientsResponse>([])

async function refreshClients() {
  clientsData.value = await apiFetch<AgencyClientsResponse>('/api/agency/clients', {
    query: { limit: 200 },
  }).catch(() => [])
}

await refreshClients()
const clients = computed<AgencyClientOption[]>(() => {
  const d = clientsData.value
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const route = useRoute()
const { user, fetchUser } = useAuth()
if (!user.value) await fetchUser()

const { conversations, loading, hasMore, load, loadMore, open, reply, markRead, refresh } = useSocialInbox(clientId)
const accountHealth = ref<SocialInboxAccountHealth[]>([])

async function refreshAccountHealth() {
  accountHealth.value = await apiFetch<SocialInboxAccountHealth[]>('/api/agency/social/inbox/accounts/health', {
    query: { clientId: clientId.value },
  }).catch(() => [])
}

await refreshAccountHealth()

const selectedId = ref<string | null>(null)
const thread = ref<{ conversation: SocialConversation | null, messages: SocialMessage[] }>({ conversation: null, messages: [] })
const timeline = ref<SocialInboxCaseTimelineItem[]>([])
const timelineLoading = ref(false)
const aiTriage = ref<SocialInboxAiTriageResult | null>(null)
const aiTriageLoading = ref(false)
const aiActionBusy = ref<string | null>(null)
const aiActionProposals = ref<Record<string, SocialInboxAiActionProposal>>({})
const sending = ref(false)
const approvalRequesting = ref(false)
const syncing = ref(false)
const healthOpen = ref(false)
const lastSync = ref<(SocialInboxSyncResult & { finishedAt: string }) | null>(null)
const filters = ref<Record<string, string>>({ status: 'open' })
const toast = useToast()
const typingByConversation = ref<Record<string, { actorId?: string, actorName?: string, expiresAt: number }>>({})
const TYPING_STALE_MS = 12000
let typingCleanupTimer: ReturnType<typeof setInterval> | null = null

function resetAiState() {
  aiTriage.value = null
  aiTriageLoading.value = false
  aiActionBusy.value = null
  aiActionProposals.value = {}
}

async function reload() {
  await load(filters.value)
}
watch(clientId, () => {
  selectedId.value = null
  thread.value = { conversation: null, messages: [] }
  timeline.value = []
  resetAiState()
  typingByConversation.value = {}
  reload()
  void refreshAccountHealth()
})
onMounted(async () => {
  await reload()
  typingCleanupTimer = setInterval(pruneTypingPresence, 4000)
  const requestedConversation = typeof route.query.conversation === 'string' ? route.query.conversation : null
  if (requestedConversation) await select(requestedConversation)
})
onBeforeUnmount(() => {
  if (typingCleanupTimer) clearInterval(typingCleanupTimer)
})

async function onFilter(f: Record<string, string>) {
  filters.value = f
  await reload()
}
async function onLoadMore() {
  await loadMore(filters.value)
}

async function select(id: string) {
  selectedId.value = id
  resetAiState()
  const [opened] = await Promise.all([
    open(id),
    loadTimeline(id)
  ])
  thread.value = opened
  if (thread.value.conversation?.unread_count) {
    await markRead(id)
    reload()
  }
}

async function onSend(content: string) {
  if (!selectedId.value) return
  sending.value = true
  try {
    await reply(selectedId.value, content)
    thread.value = await open(selectedId.value)
    await loadTimeline(selectedId.value)
    toast.add({ title: 'Reply sent', color: 'success' })
    reload()
  } catch (e: unknown) {
    toast.add({ title: 'Reply failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    sending.value = false
  }
}

async function onRequestClientApproval(content: string) {
  if (!selectedId.value) return
  approvalRequesting.value = true
  try {
    await apiFetch(`/api/agency/social/inbox/conversations/${selectedId.value}/client-approval`, {
      method: 'POST',
      body: { content },
      headers: { 'Idempotency-Key': idempotencyKey('social-inbox-client-approval') }
    })
    thread.value = await open(selectedId.value)
    await loadTimeline(selectedId.value)
    await reload()
    toast.add({ title: 'Sent to client approval', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Approval request failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    approvalRequesting.value = false
  }
}

async function patchSelectedConversation(body: Record<string, unknown>) {
  if (!selectedId.value) return
  await apiFetch(`/api/agency/social/inbox/conversations/${selectedId.value}`, { method: 'PATCH', body, headers: { 'Idempotency-Key': idempotencyKey('social-inbox-patch') } })
  thread.value = await open(selectedId.value)
  await loadTimeline(selectedId.value)
  await reload()
}

async function loadTimeline(id = selectedId.value) {
  if (!id) {
    timeline.value = []
    return
  }
  timelineLoading.value = true
  try {
    const data = await apiFetch<{ timeline: SocialInboxCaseTimelineItem[] }>(
      `/api/agency/social/inbox/conversations/${id}/timeline`,
      { query: { limit: 40 } }
    )
    timeline.value = data.timeline ?? []
  } catch (e: unknown) {
    timeline.value = []
    toast.add({ title: 'Timeline failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    timelineLoading.value = false
  }
}

async function onStatus(s: 'open' | 'snoozed' | 'closed') {
  await patchSelectedConversation({ status: s })
}
async function onMarkRead() {
  if (!selectedId.value) return
  await markRead(selectedId.value)
  thread.value = await open(selectedId.value)
  await reload()
}
async function onAssigned(userId: string | null) {
  await patchSelectedConversation({ assigned_to: userId })
}
async function onTriage(patch: { priority?: SocialInboxPriority | null, tags?: string[] }) {
  await patchSelectedConversation(patch)
}
async function onNativeLinks(patch: { linked_task_id?: string | null, linked_client_request_id?: string | null }) {
  if (!selectedId.value) return
  try {
    await apiFetch(`/api/agency/social/inbox/conversations/${selectedId.value}/native-links`, { method: 'PATCH', body: patch, headers: { 'Idempotency-Key': idempotencyKey('social-inbox-native-links') } })
    thread.value = await open(selectedId.value)
    await loadTimeline(selectedId.value)
    await reload()
    toast.add({ title: 'Workflow link updated', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Link failed', description: fetchErrorDescription(e), color: 'error' })
  }
}

async function onAiTriage() {
  if (!selectedId.value) return
  aiTriageLoading.value = true
  aiActionProposals.value = {}
  try {
    const data = await apiFetch<{ triage: SocialInboxAiTriageResult }>(
      `/api/agency/social/inbox/conversations/${selectedId.value}/ai-triage`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey('social-inbox-ai-triage') } }
    )
    aiTriage.value = data.triage
  } catch (e: unknown) {
    toast.add({ title: 'AI triage failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    aiTriageLoading.value = false
  }
}

async function onAiApplyTriage(patch: { priority?: SocialInboxPriority | null, tags?: string[] }) {
  try {
    await onTriage(patch)
    toast.add({ title: 'AI triage applied', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Triage update failed', description: fetchErrorDescription(e), color: 'error' })
  }
}

async function onAiProposeAction(payload: { actionKey: string, input: SocialInboxAiActionInput }) {
  if (!selectedId.value) return
  aiActionBusy.value = `${payload.actionKey}:propose`
  try {
    const data = await apiFetch<{ proposal: SocialInboxAiActionProposal }>(
      `/api/agency/social/inbox/conversations/${selectedId.value}/ai-actions/propose`,
      { method: 'POST', body: payload.input, headers: { 'Idempotency-Key': idempotencyKey('social-inbox-ai-propose') } }
    )
    aiActionProposals.value = { ...aiActionProposals.value, [payload.actionKey]: data.proposal }
    toast.add({ title: 'AI action staged', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'AI action failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    aiActionBusy.value = null
  }
}

async function onAiConfirmAction(payload: { actionKey: string, proposal: SocialInboxAiActionProposal }) {
  if (!selectedId.value) return
  aiActionBusy.value = `${payload.actionKey}:confirm`
  try {
    await apiFetch(`/api/agency/social/inbox/conversations/${selectedId.value}/ai-actions/confirm`, {
      method: 'POST',
      body: { proposalId: payload.proposal.proposalId },
      headers: { 'Idempotency-Key': idempotencyKey('social-inbox-ai-confirm') }
    })
    aiActionProposals.value = Object.fromEntries(
      Object.entries(aiActionProposals.value).filter(([key]) => key !== payload.actionKey)
    )
    thread.value = await open(selectedId.value)
    await loadTimeline(selectedId.value)
    await reload()
    toast.add({ title: 'AI action completed', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'AI action failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    aiActionBusy.value = null
  }
}

async function onPanelChanged() {
  if (!selectedId.value) return
  thread.value = await open(selectedId.value)
  await loadTimeline(selectedId.value)
  await reload()
}

async function onRefresh() {
  syncing.value = true
  try {
    const r = await refresh()
    lastSync.value = { ...r, finishedAt: new Date().toISOString() }
    const partial = Boolean(r.timedOut || r.skipped)
    toast.add({
      title: partial ? 'Sync partially completed' : 'Sync complete',
      description: formatSocialInboxSyncSummary(r),
      color: partial ? 'warning' : 'success'
    })
    await reload()
    await refreshAccountHealth()
  } catch {
    toast.add({ title: 'Sync failed', color: 'error' })
  } finally {
    syncing.value = false
  }
}

const selectedConv = computed(() => thread.value.conversation)
const selectedCapabilities = computed(() => getSocialInboxCapabilities(selectedConv.value))
const replyDisabled = computed(() => !selectedCapabilities.value.reply.enabled)
const replyDisabledReason = computed(() => selectedCapabilities.value.reply.reason || '')
const selectedTypingWarning = computed(() => {
  if (!selectedId.value) return null
  const typing = typingByConversation.value[selectedId.value]
  if (!typing || typing.expiresAt <= Date.now()) return null
  return `${typing.actorName || 'Another team member'} is drafting a reply`
})
const accountHealthRows = computed(() => accountHealth.value ?? [])
const activeAccountCount = computed(() => accountHealthRows.value.filter(a => a.is_active).length)
const accountIssueCount = computed(() => accountHealthRows.value.filter(a => ['attention', 'reauth'].includes(a.status)).length)
const lastSyncIssueCount = computed(() => getSocialInboxSyncIssueCount(lastSync.value))
const latestAccountSyncAt = computed(() => {
  return accountHealthRows.value
    .map(a => a.last_synced_at)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
})

function formatDateTime(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : 'Not synced yet'
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

function pruneTypingPresence() {
  const now = Date.now()
  const next: typeof typingByConversation.value = {}
  for (const [conversationId, typing] of Object.entries(typingByConversation.value)) {
    if (typing.expiresAt > now) next[conversationId] = typing
  }
  typingByConversation.value = next
}

function handleTypingEvent(e: { conversationId?: string, actorId?: string, actorName?: string, active?: boolean }) {
  if (!e.conversationId) return
  if (e.actorId && user.value?.id && e.actorId === user.value.id) return

  const next = { ...typingByConversation.value }
  if (e.active === false) {
    const { [e.conversationId]: _removed, ...remaining } = next
    typingByConversation.value = remaining
    return
  } else {
    next[e.conversationId] = {
      actorId: e.actorId,
      actorName: e.actorName,
      expiresAt: Date.now() + TYPING_STALE_MS
    }
  }
  typingByConversation.value = next
}

// Live updates: refresh the list on any event for this client, and the open thread if it's the
// affected conversation. Degrades to polling when SSE/the DO are unavailable.
const sseEndpoint = computed(() => clientId.value ? `/api/agency/social/inbox/events?clientId=${clientId.value}` : null)
useSocialInboxRealtime(sseEndpoint, {
  onRefresh: () => { reload() },
  onEvent: async (e) => {
    if (e.type === 'reply.typing') {
      handleTypingEvent(e)
      return
    }
    if (e.conversationId && e.conversationId === selectedId.value) {
      thread.value = await open(selectedId.value)
    }
  },
  shouldRefresh: e => e.type !== 'reply.typing'
})
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <div class="flex flex-wrap items-center gap-3 p-4 border-b border-default">
      <h1 class="text-lg font-semibold">
        Engagement Inbox
      </h1>
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-xs font-medium text-muted">Inbox client</span>
        <USelectMenu
          v-model="clientId"
          :items="clientOptions"
          value-key="value"
          placeholder="Inbox client"
          class="w-56 max-w-full"
        />
      </div>
      <UButton
        to="/agency/social/inbox/reviews"
        label="Reviews"
        icon="i-lucide-star"
        variant="subtle"
        size="sm"
      />
      <UButton
        class="sm:ml-auto"
        label="Refresh"
        icon="i-lucide-refresh-cw"
        :loading="syncing"
        variant="subtle"
        size="sm"
        @click="onRefresh"
      />
    </div>
    <div class="px-4">
      <SocialSuiteSectionNav />
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-y border-default text-xs text-muted">
      <span class="inline-flex items-center gap-1.5">
        <UIcon name="i-lucide-radio-tower" class="size-3.5" />
        {{ activeAccountCount }} / {{ accountHealthRows.length }} active accounts
      </span>
      <span>Last account sync: {{ formatDateTime(latestAccountSyncAt) }}</span>
      <UBadge
        v-if="accountIssueCount"
        color="warning"
        variant="subtle"
        size="xs"
      >
        {{ plural(accountIssueCount, 'account') }} need attention
      </UBadge>
      <UButton
        label="Health details"
        icon="i-lucide-activity"
        variant="ghost"
        size="xs"
        class="-my-1"
        @click="healthOpen = true"
      />
      <span v-if="lastSync" class="inline-flex min-w-0 items-center gap-1.5">
        <span>Last refresh: {{ formatSocialInboxSyncSummary(lastSync) }}</span>
        <UBadge
          v-if="lastSync.timedOut"
          color="warning"
          variant="subtle"
          size="xs"
        >Partial</UBadge>
        <UBadge
          v-if="lastSyncIssueCount"
          color="warning"
          variant="subtle"
          size="xs"
        >
          {{ plural(lastSyncIssueCount, 'channel') }} need attention
        </UBadge>
      </span>
    </div>
    <div class="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_300px] overflow-hidden">
      <SocialInboxSidebar
        :conversations="conversations"
        :selected-id="selectedId"
        :loading="loading"
        :has-more="hasMore"
        @select="select"
        @filter="onFilter"
        @load-more="onLoadMore"
      />
      <div class="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
        <SocialInboxThread :conversation="selectedConv" :messages="thread.messages" class="min-h-0 w-full flex-1" />
        <SocialInboxComposer
          v-if="selectedConv"
          :sending="sending"
          :approval-requesting="approvalRequesting"
          :disabled="replyDisabled"
          :conversation-id="selectedConv?.id"
          :typing-warning="selectedTypingWarning"
          :disabled-reason="replyDisabledReason"
          @send="onSend"
          @request-approval="onRequestClientApproval"
        />
      </div>
      <SocialInboxActionPanel
        class="h-full min-h-0 w-full"
        :conversation="selectedConv"
        :timeline="timeline"
        :timeline-loading="timelineLoading"
        :ai-triage="aiTriage"
        :ai-triage-loading="aiTriageLoading"
        :ai-action-busy="aiActionBusy"
        :ai-action-proposals="aiActionProposals"
        @status="onStatus"
        @mark-read="onMarkRead"
        @assigned="onAssigned"
        @triage="onTriage"
        @native-links="onNativeLinks"
        @ai-triage="onAiTriage"
        @ai-apply-triage="onAiApplyTriage"
        @ai-propose-action="onAiProposeAction"
        @ai-confirm-action="onAiConfirmAction"
        @changed="onPanelChanged"
      />
    </div>
    <SocialInboxAccountHealthDrawer
      v-model:open="healthOpen"
      :accounts="accountHealthRows"
      :sync-result="lastSync"
    />
  </div>
</template>
