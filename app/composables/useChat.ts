/**
 * Composable for chat channel management (REST API layer).
 * Handles channels, messages, DMs, membership — complements useChatWebSocket (real-time).
 */
import type { ChatChannel, ChatMessage, ChatChannelMember } from '~/types'

// Shared state across components (singleton pattern)
const channels = ref<ChatChannel[]>([])
const activeChannel = ref<ChatChannel | null>(null)
const messages = ref<ChatMessage[]>([])
const loadingChannels = ref(false)
const loadingMessages = ref(false)
const hasMoreMessages = ref(true)

export function useChat() {
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(request: string, options?: {
    method?: string
    body?: unknown
    params?: Record<string, unknown>
  }) => Promise<T>

  // ── Channels ──

  async function fetchChannels() {
    loadingChannels.value = true
    try {
      const data = await apiFetch<ChatChannel[]>('/api/chat/channels')
      channels.value = data
    } catch {
      toast.add({ title: 'Error', description: 'Failed to load channels', color: 'error' })
    } finally {
      loadingChannels.value = false
    }
  }

  async function createChannel(opts: {
    name: string
    type?: 'channel' | 'group_dm'
    isPrivate?: boolean
    description?: string
    memberIds?: string[]
    departmentId?: string
    taskId?: string
  }) {
    const channel = await apiFetch<ChatChannel>('/api/chat/channels', {
      method: 'POST',
      body: opts
    })
    channels.value.unshift(channel)
    return channel
  }

  async function fetchChannelDetails(channelId: string) {
    const data = await apiFetch<ChatChannel & { members: ChatChannelMember[] }>(
      `/api/chat/channels/${channelId}`
    )
    return data
  }

  // ── Direct Messages ──

  async function openDM(userId: string) {
    const channel = await apiFetch<ChatChannel>('/api/chat/dm', {
      method: 'POST',
      body: { userId }
    })
    // Add to list if not already present
    if (!channels.value.find(c => c.id === channel.id)) {
      channels.value.unshift(channel)
    }
    return channel
  }

  // ── Messages ──

  async function fetchMessages(channelId: string, before?: number) {
    if (!before) {
      // Fresh load
      messages.value = []
      hasMoreMessages.value = true
    }
    loadingMessages.value = true
    try {
      const params: Record<string, string> = { limit: '50' }
      if (before) params.before = String(before)

      const data = await apiFetch<ChatMessage[]>(
        `/api/chat/channels/${channelId}/messages`,
        { params }
      )
      if (before) {
        // Prepend older messages
        messages.value = [...data, ...messages.value]
      } else {
        messages.value = data
      }
      hasMoreMessages.value = data.length >= 50
    } catch {
      toast.add({ title: 'Error', description: 'Failed to load messages', color: 'error' })
    } finally {
      loadingMessages.value = false
    }
  }

  async function loadMoreMessages() {
    if (!activeChannel.value || !hasMoreMessages.value || loadingMessages.value) return
    const oldest = messages.value[0]
    if (oldest) {
      await fetchMessages(activeChannel.value.id, oldest.id)
    }
  }

  async function fetchThreadMessages(channelId: string, threadParentId: number) {
    const data = await apiFetch<ChatMessage[]>(
      `/api/chat/channels/${channelId}/messages`,
      { params: { threadParentId: String(threadParentId), limit: '100' } }
    )
    return data
  }

  // ── Read State ──

  async function markChannelAsRead(channelId: string, messageId: number) {
    try {
      await apiFetch(`/api/chat/channels/${channelId}/read`, {
        method: 'PATCH',
        body: { messageId }
      })
      // Update local unread count
      const ch = channels.value.find(c => c.id === channelId)
      if (ch) ch.unread_count = 0
    } catch {
      // Silent fail — not critical
    }
  }

  // ── Membership ──

  async function addMember(channelId: string, userId: string, role = 'member') {
    await apiFetch(`/api/chat/channels/${channelId}/members`, {
      method: 'POST',
      body: { userId, role }
    })
  }

  async function removeMember(channelId: string, userId: string) {
    await apiFetch(`/api/chat/channels/${channelId}/members`, {
      method: 'DELETE',
      body: { userId }
    })
  }

  // ── Channel Selection ──

  async function selectChannel(channel: ChatChannel) {
    activeChannel.value = channel
    await fetchMessages(channel.id)
    // Mark as read if there are messages
    if (messages.value.length > 0) {
      const lastMsg = messages.value[messages.value.length - 1]
      markChannelAsRead(channel.id, lastMsg.id)
    }
  }

  // ── Helpers ──

  const totalUnreadCount = computed(() =>
    channels.value.reduce((sum, ch) => sum + (ch.unread_count || 0), 0)
  )

  const channelsByType = computed(() => ({
    channels: channels.value.filter(c => c.type === 'channel'),
    dms: channels.value.filter(c => c.type === 'dm' || c.type === 'group_dm')
  }))

  /**
   * Apply a real-time WS message to the local messages array.
   * Called from the chat page after receiving a WebSocket event.
   */
  function applyWsMessage(wsMsg: {
    type: string
    id?: number
    messageId?: number
    userId?: string
    userName?: string
    userAvatar?: string
    content?: string
    threadParentId?: number | null
    metadata?: Record<string, unknown>
    createdAt?: string
    editedAt?: string
    reactions?: Array<{ emoji: string; userIds: string[]; count: number }>
  }) {
    switch (wsMsg.type) {
      case 'message': {
        if (!wsMsg.id) return
        // Avoid duplicates
        if (messages.value.find(m => m.id === wsMsg.id)) return
        // Only add top-level messages to main feed
        if (wsMsg.threadParentId) {
          // Update thread count on parent
          const parent = messages.value.find(m => m.id === wsMsg.threadParentId)
          if (parent) {
            parent.thread_count = (parent.thread_count || 0) + 1
          }
          return
        }
        messages.value.push({
          id: wsMsg.id,
          channel_id: activeChannel.value?.id || '',
          user_id: wsMsg.userId || '',
          content: wsMsg.content || '',
          thread_parent_id: undefined,
          reply_to_id: (wsMsg.metadata as any)?.replyToId || undefined,
          metadata: wsMsg.metadata as ChatMessage['metadata'],
          created_at: wsMsg.createdAt || new Date().toISOString(),
          user_name: wsMsg.userName,
          user_avatar: wsMsg.userAvatar,
          reactions: [],
          thread_count: 0
        })
        break
      }
      case 'edit': {
        const msg = messages.value.find(m => m.id === wsMsg.messageId)
        if (msg) {
          msg.content = wsMsg.content || msg.content
          msg.edited_at = wsMsg.editedAt || new Date().toISOString()
        }
        break
      }
      case 'delete': {
        const idx = messages.value.findIndex(m => m.id === wsMsg.messageId)
        if (idx !== -1) messages.value.splice(idx, 1)
        break
      }
      case 'reaction': {
        const msg = messages.value.find(m => m.id === wsMsg.messageId)
        if (msg && wsMsg.reactions) {
          msg.reactions = wsMsg.reactions.map(r => ({
            emoji: r.emoji,
            user_ids: r.userIds,
            count: r.count
          }))
        }
        break
      }
    }
  }

  /**
   * Update channel list when a new message arrives (for sidebar preview).
   */
  /** Silent channel refresh for background unread polling (no toast on error) */
  async function refreshUnreadCounts() {
    try {
      const data = await apiFetch<ChatChannel[]>('/api/chat/channels')
      // Preserve activeChannel reference — only update unread counts and last_message
      for (const fresh of data) {
        const existing = channels.value.find(c => c.id === fresh.id)
        if (existing) {
          existing.unread_count = fresh.unread_count
          existing.last_message = fresh.last_message
          existing.last_read_message_id = fresh.last_read_message_id
        }
      }
      // Add any new channels the user joined elsewhere
      for (const fresh of data) {
        if (!channels.value.find(c => c.id === fresh.id)) {
          channels.value.push(fresh)
        }
      }
      // Remove channels the user left
      channels.value = channels.value.filter(c => data.find(d => d.id === c.id))
    } catch {
      // Silent — background poll
    }
  }

  function updateChannelPreview(channelId: string, content: string, userName: string) {
    const ch = channels.value.find(c => c.id === channelId)
    if (ch) {
      ch.last_message = {
        id: 0,
        channel_id: channelId,
        user_id: '',
        content: content.substring(0, 120),
        created_at: new Date().toISOString(),
        user_name: userName
      }
      // If not the active channel, increment unread
      if (activeChannel.value?.id !== channelId) {
        ch.unread_count = (ch.unread_count || 0) + 1
      }
      // Move channel to top
      const idx = channels.value.indexOf(ch)
      if (idx > 0) {
        channels.value.splice(idx, 1)
        channels.value.unshift(ch)
      }
    }
  }

  return {
    // State
    channels,
    activeChannel,
    messages,
    loadingChannels,
    loadingMessages,
    hasMoreMessages,
    totalUnreadCount,
    channelsByType,
    // Actions
    fetchChannels,
    createChannel,
    fetchChannelDetails,
    openDM,
    fetchMessages,
    loadMoreMessages,
    fetchThreadMessages,
    markChannelAsRead,
    addMember,
    removeMember,
    selectChannel,
    applyWsMessage,
    updateChannelPreview,
    refreshUnreadCounts
  }
}
