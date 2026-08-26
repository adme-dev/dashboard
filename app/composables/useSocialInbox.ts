// app/composables/useSocialInbox.ts
// Data composable for the Slice 2 engagement inbox. Reads via $fetch (driven by an
// explicit clientId) and exposes the conversation list + thread loader + mutations.
import type { Ref } from 'vue'
import type { SocialConversation, SocialInboxSyncResult, SocialMessage } from '~/types'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

const PAGE_LIMIT = 100

export function useSocialInbox(clientId: Ref<string | null>) {
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown>; headers?: Record<string, string> }
  ) => Promise<T>
  const conversations = ref<SocialConversation[]>([])
  const loading = ref(false)
  const hasMore = ref(false)

  async function load(filters: Record<string, string> = {}, options: { append?: boolean } = {}) {
    if (!clientId.value) {
      conversations.value = []
      hasMore.value = false
      return
    }
    loading.value = true
    try {
      const rows = await apiFetch<SocialConversation[]>('/api/agency/social/inbox/conversations', {
        query: {
          clientId: clientId.value,
          ...filters,
          limit: PAGE_LIMIT,
          offset: options.append ? conversations.value.length : 0
        }
      })
      if (options.append) {
        const seen = new Set(conversations.value.map(c => c.id))
        conversations.value = conversations.value.concat(rows.filter(c => !seen.has(c.id)))
      } else {
        conversations.value = rows
      }
      hasMore.value = rows.length === PAGE_LIMIT
    } finally {
      loading.value = false
    }
  }

  async function loadMore(filters: Record<string, string> = {}) {
    await load(filters, { append: true })
  }

  async function open(id: string) {
    return await apiFetch<{ conversation: SocialConversation, messages: SocialMessage[] }>(
      `/api/agency/social/inbox/conversations/${id}`
    )
  }

  async function reply(id: string, content: string) {
    return await apiFetch<{ ok: boolean, platformMessageId: string }>(
      `/api/agency/social/inbox/conversations/${id}/reply`,
      { method: 'POST', body: { content }, headers: { 'Idempotency-Key': idempotencyKey('social-inbox-reply') } }
    )
  }

  async function setStatus(id: string, status: 'open' | 'snoozed' | 'closed') {
    return await apiFetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { status }, headers: { 'Idempotency-Key': idempotencyKey('social-inbox-status') } })
  }

  async function markRead(id: string) {
    return await apiFetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { markRead: true }, headers: { 'Idempotency-Key': idempotencyKey('social-inbox-read') } })
  }

  async function refresh() {
    return await apiFetch<SocialInboxSyncResult>('/api/agency/social/inbox/accounts/sync', {
      method: 'POST',
      body: { clientId: clientId.value },
      headers: { 'Idempotency-Key': idempotencyKey('social-inbox-sync') }
    })
  }

  return { conversations, loading, hasMore, load, loadMore, open, reply, setStatus, markRead, refresh }
}
