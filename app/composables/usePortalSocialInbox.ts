// app/composables/usePortalSocialInbox.ts
// Client-portal data composable for the engagement inbox (Slice 2d). Session-scoped: it never
// passes a clientId — the portal API derives the tenant from the client session cookie.
import type { SocialConversation, SocialMessage } from '~/types'

interface PortalApproval {
  id: string
  conversation_id: string
  draft_content: string
  confidence: number | null
  created_at: string
  platform: string
  channel_type: string
  participant_name: string | null
  permalink: string | null
  inbound_preview: string | null
  rating: number | null
}

export function usePortalSocialInbox() {
  const conversations = ref<SocialConversation[]>([])
  const loading = ref(false)
  const approvals = ref<PortalApproval[]>([])

  async function load(filters: Record<string, string> = {}) {
    loading.value = true
    try {
      conversations.value = await $fetch<SocialConversation[]>('/api/client-portal/social/conversations', { query: filters })
    } finally {
      loading.value = false
    }
  }

  async function open(id: string) {
    return await $fetch<{ conversation: SocialConversation; messages: SocialMessage[] }>(
      `/api/client-portal/social/conversations/${id}`,
    )
  }

  async function loadApprovals() {
    approvals.value = await $fetch<PortalApproval[]>('/api/client-portal/social/response-queue')
  }

  async function approve(id: string, content?: string) {
    return await $fetch<{ ok: boolean; platformMessageId?: string }>(
      `/api/client-portal/social/response-queue/${id}/approve`,
      { method: 'POST', body: { content } },
    )
  }

  async function reject(id: string) {
    return await $fetch<{ ok: boolean }>(
      `/api/client-portal/social/response-queue/${id}/reject`, { method: 'POST' },
    )
  }

  return { conversations, loading, approvals, load, open, loadApprovals, approve, reject }
}
