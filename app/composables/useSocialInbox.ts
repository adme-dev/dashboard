// app/composables/useSocialInbox.ts
// Data composable for the Slice 2 engagement inbox. Reads via $fetch (driven by an
// explicit clientId) and exposes the conversation list + thread loader + mutations.
import type { Ref } from 'vue'
import type { SocialConversation, SocialInboxSyncResult, SocialMessage } from '~/types'

const PAGE_LIMIT = 100

export function useSocialInbox(clientId: Ref<string | null>) {
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
      const rows = await $fetch<SocialConversation[]>('/api/agency/social/inbox/conversations', {
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
    return await $fetch<{ conversation: SocialConversation, messages: SocialMessage[] }>(
      `/api/agency/social/inbox/conversations/${id}`
    )
  }

  async function reply(id: string, content: string) {
    return await $fetch<{ ok: boolean, platformMessageId: string }>(
      `/api/agency/social/inbox/conversations/${id}/reply`,
      { method: 'POST', body: { content } }
    )
  }

  async function setStatus(id: string, status: 'open' | 'snoozed' | 'closed') {
    return await $fetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { status } })
  }

  async function markRead(id: string) {
    return await $fetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { markRead: true } })
  }

  async function refresh() {
    return await $fetch<SocialInboxSyncResult>('/api/agency/social/inbox/accounts/sync', {
      method: 'POST',
      body: { clientId: clientId.value }
    })
  }

  return { conversations, loading, hasMore, load, loadMore, open, reply, setStatus, markRead, refresh }
}
