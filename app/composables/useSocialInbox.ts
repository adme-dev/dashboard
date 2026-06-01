// app/composables/useSocialInbox.ts
// Data composable for the Slice 2 engagement inbox. Reads via $fetch (driven by an
// explicit clientId) and exposes the conversation list + thread loader + mutations.
import type { Ref } from 'vue'
import type { SocialConversation, SocialMessage } from '~/types'

export function useSocialInbox(clientId: Ref<string | null>) {
  const conversations = ref<SocialConversation[]>([])
  const loading = ref(false)

  async function load(filters: Record<string, string> = {}) {
    if (!clientId.value) { conversations.value = []; return }
    loading.value = true
    try {
      conversations.value = await $fetch<SocialConversation[]>('/api/agency/social/inbox/conversations', {
        query: { clientId: clientId.value, ...filters },
      })
    } finally {
      loading.value = false
    }
  }

  async function open(id: string) {
    return await $fetch<{ conversation: SocialConversation; messages: SocialMessage[] }>(
      `/api/agency/social/inbox/conversations/${id}`,
    )
  }

  async function reply(id: string, content: string) {
    return await $fetch<{ ok: boolean; platformMessageId: string }>(
      `/api/agency/social/inbox/conversations/${id}/reply`,
      { method: 'POST', body: { content } },
    )
  }

  async function setStatus(id: string, status: 'open' | 'snoozed' | 'closed') {
    return await $fetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { status } })
  }

  async function markRead(id: string) {
    return await $fetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { markRead: true } })
  }

  async function refresh() {
    return await $fetch<{ synced: number }>('/api/agency/social/inbox/accounts/sync', { method: 'POST' })
  }

  return { conversations, loading, load, open, reply, setStatus, markRead, refresh }
}
