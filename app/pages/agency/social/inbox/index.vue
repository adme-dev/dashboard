<script setup lang="ts">
import { useSocialInbox } from '~/composables/useSocialInbox'
import { useSocialInboxRealtime } from '~/composables/useSocialInboxRealtime'
import type { SocialConversation, SocialInboxAccountHealth, SocialInboxPriority, SocialInboxSyncResult, SocialMessage } from '~/types'
import { getSocialInboxCapabilities } from '~/utils/socialInboxCapabilities'
import { formatSocialInboxSyncSummary, getSocialInboxSyncIssueCount } from '~/utils/socialInboxSync'

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

const { data: clientsData } = await useFetch<AgencyClientsResponse>('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<AgencyClientOption[]>(() => {
  const d = clientsData.value
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const { user, fetchUser } = useAuth()
if (!user.value) await fetchUser()

const { conversations, loading, hasMore, load, loadMore, open, reply, markRead, refresh } = useSocialInbox(clientId)
const { data: accountHealth, refresh: refreshAccountHealth } = await useFetch<SocialInboxAccountHealth[]>(
  '/api/agency/social/inbox/accounts/health',
  { query: { clientId }, watch: [clientId], default: () => [] }
)

const selectedId = ref<string | null>(null)
const thread = ref<{ conversation: SocialConversation | null, messages: SocialMessage[] }>({ conversation: null, messages: [] })
const sending = ref(false)
const syncing = ref(false)
const healthOpen = ref(false)
const lastSync = ref<(SocialInboxSyncResult & { finishedAt: string }) | null>(null)
const filters = ref<Record<string, string>>({ status: 'open' })
const toast = useToast()
const typingByConversation = ref<Record<string, { actorId?: string, actorName?: string, expiresAt: number }>>({})
const TYPING_STALE_MS = 12000
let typingCleanupTimer: ReturnType<typeof setInterval> | null = null

async function reload() {
  await load(filters.value)
}
watch(clientId, () => {
  selectedId.value = null
  thread.value = { conversation: null, messages: [] }
  typingByConversation.value = {}
  reload()
})
onMounted(() => {
  reload()
  typingCleanupTimer = setInterval(pruneTypingPresence, 4000)
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
  thread.value = await open(id)
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
    toast.add({ title: 'Reply sent', color: 'success' })
    reload()
  } catch (e: unknown) {
    toast.add({ title: 'Reply failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    sending.value = false
  }
}

async function patchSelectedConversation(body: Record<string, unknown>) {
  if (!selectedId.value) return
  await $fetch(`/api/agency/social/inbox/conversations/${selectedId.value}`, { method: 'PATCH', body })
  thread.value = await open(selectedId.value)
  await reload()
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
      <USelectMenu
        v-model="clientId"
        :items="clientOptions"
        value-key="value"
        placeholder="Select client"
        class="w-56 max-w-full"
      />
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
    <div class="flex-1 grid grid-cols-[320px_1fr_240px] min-h-0">
      <SocialInboxSidebar
        :conversations="conversations"
        :selected-id="selectedId"
        :loading="loading"
        :has-more="hasMore"
        @select="select"
        @filter="onFilter"
        @load-more="onLoadMore"
      />
      <div class="flex flex-col min-h-0">
        <SocialInboxThread :conversation="selectedConv" :messages="thread.messages" class="flex-1 min-h-0" />
        <SocialInboxComposer
          v-if="selectedConv"
          :sending="sending"
          :disabled="replyDisabled"
          :conversation-id="selectedConv?.id"
          :typing-warning="selectedTypingWarning"
          :disabled-reason="replyDisabledReason"
          @send="onSend"
        />
      </div>
      <SocialInboxActionPanel
        :conversation="selectedConv"
        @status="onStatus"
        @mark-read="onMarkRead"
        @assigned="onAssigned"
        @triage="onTriage"
      />
    </div>
    <SocialInboxAccountHealthDrawer
      v-model:open="healthOpen"
      :accounts="accountHealthRows"
      :sync-result="lastSync"
    />
  </div>
</template>
