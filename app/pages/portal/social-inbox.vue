<script setup lang="ts">
import { usePortalSocialInbox } from '~/composables/usePortalSocialInbox'
import { useSocialInboxRealtime } from '~/composables/useSocialInboxRealtime'
import { usePortalAuth } from '~/composables/usePortalAuth'
import type { SocialConversation, SocialMessage } from '~/types'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Social — Client Portal' })

const { user } = usePortalAuth()
const canApprove = computed(() => !!user.value?.permissions?.canApproveWork)

const { conversations, loading, approvals, load, open, loadApprovals, approve, reject } = usePortalSocialInbox()
const toast = useToast()

function fetchErrorDescription(error: unknown) {
  const e = error as { data?: { statusMessage?: string }, message?: string }
  return e.data?.statusMessage || e.message
}

const tab = ref('inbox')
const tabItems = computed(() => [
  { label: 'Inbox', value: 'inbox', icon: 'i-lucide-messages-square' },
  {
    label: approvals.value.length ? `Approvals (${approvals.value.length})` : 'Approvals',
    value: 'approvals', icon: 'i-lucide-check-circle'
  }
])

// ── Inbox (read-only) ──────────────────────────────────────────────────────
const selectedId = ref<string | null>(null)
const thread = ref<{ conversation: SocialConversation | null, messages: SocialMessage[] }>({ conversation: null, messages: [] })
const filters = ref<Record<string, string>>({ status: 'open' })

async function reload() {
  await load(filters.value)
}
async function onFilter(f: Record<string, string>) {
  filters.value = f
  await reload()
}
async function select(id: string) {
  selectedId.value = id
  thread.value = await open(id)
}
const selectedConv = computed(() => thread.value.conversation)

// ── Approvals ──────────────────────────────────────────────────────────────
const busyId = ref<string | null>(null)
async function onApprove(id: string, content: string) {
  busyId.value = id
  try {
    await approve(id, content)
    toast.add({ title: 'Response approved', description: 'The agency team will send it from their queue.', color: 'success' })
    await Promise.all([loadApprovals(), reload()])
  } catch (e: unknown) {
    toast.add({ title: 'Approval failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    busyId.value = null
  }
}
async function onReject(id: string) {
  busyId.value = id
  try {
    await reject(id)
    toast.add({ title: 'Response rejected', color: 'success' })
    await loadApprovals()
  } catch (e: unknown) {
    toast.add({ title: 'Reject failed', description: fetchErrorDescription(e), color: 'error' })
  } finally {
    busyId.value = null
  }
}

// Live updates for the client's own inbox (session-scoped endpoint, no clientId in the URL).
// Refresh the list + approvals on any event, and the open thread if it's the affected conversation.
const sseEndpoint = ref<string | null>('/api/client-portal/social/events')
useSocialInboxRealtime(sseEndpoint, {
  onRefresh: () => {
    reload()
    loadApprovals()
  },
  onEvent: async (e) => {
    if (e.conversationId && e.conversationId === selectedId.value) {
      thread.value = await open(selectedId.value)
    }
  }
})

onMounted(async () => {
  await Promise.all([reload(), loadApprovals()])
})
</script>

<template>
  <div class="w-full h-[calc(100vh-4rem)] flex flex-col">
    <div class="flex items-center gap-3 px-6 py-4 border-b border-default">
      <div>
        <h1 class="text-xl font-semibold">
          Social
        </h1>
        <p class="text-sm text-muted mt-0.5">
          Comments and reviews across your connected social accounts.
        </p>
      </div>
      <UTabs
        v-model="tab"
        :items="tabItems"
        class="ml-auto w-auto"
        :content="false"
        size="sm"
      />
    </div>
    <div class="px-6">
      <PortalSocialSectionNav />
    </div>

    <!-- Inbox -->
    <div v-show="tab === 'inbox'" class="flex-1 grid grid-cols-[320px_1fr] min-h-0">
      <SocialInboxSidebar
        :conversations="conversations"
        :selected-id="selectedId"
        :loading="loading"
        @select="select"
        @filter="onFilter"
      />
      <SocialInboxThread :conversation="selectedConv" :messages="thread.messages" class="min-h-0" />
    </div>

    <!-- Approvals -->
    <div v-show="tab === 'approvals'" class="flex-1 overflow-y-auto p-6">
      <div v-if="!approvals.length" class="text-sm text-muted">
        Nothing awaiting your approval right now.
      </div>
      <div v-else class="max-w-2xl space-y-4">
        <p class="text-sm text-muted">
          These reply drafts are waiting for your approval before the agency team sends them.
        </p>
        <SocialInboxPortalApprovalCard
          v-for="a in approvals"
          :key="a.id"
          :approval="a"
          :can-approve="canApprove"
          :busy="busyId === a.id"
          @approve="onApprove"
          @reject="onReject"
        />
      </div>
    </div>
  </div>
</template>
