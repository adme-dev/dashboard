import type { AiConversation, AiMessage, AiContextSource } from '~/types'

interface ConversationListResponse {
  conversations: AiConversation[]
  total: number
  hasMore: boolean
}

interface ConversationDetail {
  conversation: AiConversation
  messages: AiMessage[]
  hasMore: boolean
  // Set on the initial load when a still-open AI proposal exists — re-attached to the last
  // assistant message so the confirm card survives a page reload (Option B rehydration).
  pendingAction?: { proposalId: string, toolName?: string, resolved: any } | null
  // Active persona key for the conversation (Slice 1.5) — re-selects the picker on reload.
  persona?: string
}

interface ChatMessageResponse {
  message: AiMessage
  contextSources: AiContextSource[]
  // toolName selects the confirm-card shape (rich budget card vs task/post/alert) — must not be dropped.
  proposedAction?: { proposalId: string, resolved: any, toolName?: string } | null
}

export function useAiChat() {
  const conversations = useState<AiConversation[]>('ai-chat-conversations', () => [])
  const activeConversation = useState<AiConversation | null>('ai-chat-active', () => null)
  const messages = useState<AiMessage[]>('ai-chat-messages', () => [])
  // Slice 1.5: active persona key sent with each message; re-initialised from the conversation on load.
  const selectedPersona = useState<string>('ai-chat-persona', () => 'general')
  const loading = ref(false)
  const sending = ref(false)
  const hasMoreConversations = ref(false)
  const hasMoreMessages = ref(false)
  const totalConversations = ref(0)

  async function fetchConversations(reset = true) {
    loading.value = true
    try {
      const offset = reset ? 0 : conversations.value.length
      const data = await $fetch<ConversationListResponse>('/api/agency/ai/chat/conversations', {
        params: { offset },
      })
      if (reset) {
        conversations.value = data.conversations
      } else {
        conversations.value.push(...data.conversations)
      }
      hasMoreConversations.value = data.hasMore
      totalConversations.value = data.total
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadMoreConversations() {
    if (!hasMoreConversations.value || loading.value) return
    await fetchConversations(false)
  }

  async function createConversation(title?: string): Promise<AiConversation> {
    const conv = await $fetch<AiConversation>('/api/agency/ai/chat/conversations', {
      method: 'POST',
      body: { title: title || null },
    })
    conversations.value.unshift(conv)
    activeConversation.value = conv
    messages.value = []
    hasMoreMessages.value = false
    totalConversations.value++
    return conv
  }

  async function loadConversation(id: string) {
    loading.value = true
    try {
      const data = await $fetch<ConversationDetail>(`/api/agency/ai/chat/conversations/${id}`)
      activeConversation.value = data.conversation
      messages.value = data.messages
      hasMoreMessages.value = data.hasMore
      selectedPersona.value = data.persona || 'general'
      // Rehydrate an open proposal onto the most recent assistant message so its confirm card
      // re-renders after a reload (matches the inline shape attached during send()).
      if (data.pendingAction) {
        for (let i = messages.value.length - 1; i >= 0; i--) {
          if (messages.value[i].role === 'assistant') {
            // Spread-replace the element (guaranteed reactive) so the card re-renders.
            messages.value[i] = { ...messages.value[i], proposedAction: data.pendingAction } as AiMessage
            break
          }
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadMoreMessages() {
    if (!activeConversation.value || !hasMoreMessages.value || loading.value) return
    const oldest = messages.value[0]
    if (!oldest) return

    loading.value = true
    try {
      const data = await $fetch<ConversationDetail>(
        `/api/agency/ai/chat/conversations/${activeConversation.value.id}`,
        { params: { before: oldest.createdAt, limit: 50 } }
      )
      messages.value.unshift(...data.messages)
      hasMoreMessages.value = data.hasMore
    } catch (err) {
      console.error('Failed to load more messages:', err)
    } finally {
      loading.value = false
    }
  }

  async function renameConversation(id: string, title: string) {
    const result = await $fetch<{ id: string; title: string; updatedAt: string }>(
      `/api/agency/ai/chat/conversations/${id}`,
      { method: 'PATCH', body: { title } }
    )
    // Update in list
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.title = result.title
      conv.updatedAt = result.updatedAt
    }
    // Update active conversation
    if (activeConversation.value?.id === id) {
      activeConversation.value.title = result.title
    }
  }

  async function togglePin(id: string) {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return

    const newPinned = !conv.isPinned
    const result = await $fetch<{ id: string; isPinned: boolean; pinnedAt: string | null; updatedAt: string }>(
      `/api/agency/ai/chat/conversations/${id}`,
      { method: 'PATCH', body: { isPinned: newPinned } }
    )

    // Update in list
    conv.isPinned = result.isPinned
    conv.pinnedAt = result.pinnedAt
    conv.updatedAt = result.updatedAt

    // Update active conversation
    if (activeConversation.value?.id === id) {
      activeConversation.value.isPinned = result.isPinned
      activeConversation.value.pinnedAt = result.pinnedAt
    }

    // Re-sort: pinned first, then by last message
    conversations.value.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      const aDate = a.lastMessageAt || a.createdAt
      const bDate = b.lastMessageAt || b.createdAt
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })
  }

  async function sendMessage(
    content: string,
    mentionedEntities?: Array<{ type: string; id: string }>,
    boardId?: string,
    // Virtual Office Mode A: when the chat is docked in an office room, pass the room so the engine
    // can enrich the prompt with who's present / the live meeting / transcript tail (membership-gated
    // server-side). Omitted by the standalone chat — the engine simply skips room enrichment.
    room?: { officeId: string, meetingId?: string, presentUserIds?: string[], transcriptTail?: string },
  ) {
    if (!activeConversation.value || sending.value) return

    sending.value = true

    // Optimistically add user message
    const tempUserMsg: AiMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversation.value.id,
      role: 'user',
      content,
      contextSources: [],
      tokenCount: null,
      model: null,
      latencyMs: null,
      isError: false,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(tempUserMsg)

    try {
      const body: Record<string, any> = { content }
      if (mentionedEntities && mentionedEntities.length > 0) {
        body.mentionedEntities = mentionedEntities
      }
      if (boardId) body.boardId = boardId
      if (selectedPersona.value) body.persona = selectedPersona.value
      if (room?.officeId) body.room = room

      const result = await $fetch<ChatMessageResponse>(
        `/api/agency/ai/chat/conversations/${activeConversation.value.id}/messages`,
        {
          method: 'POST',
          body,
        }
      )

      // The server returns the assistant message; the user message was already added optimistically.
      // Attach any proposed action so the confirmation card renders on that message.
      messages.value.push({ ...result.message, proposedAction: result.proposedAction ?? null })

      // Update conversation metadata in the list
      if (activeConversation.value) {
        activeConversation.value.messageCount += 2
        activeConversation.value.lastMessageAt = new Date().toISOString()

        // Update title if it was auto-generated (first message)
        if (!activeConversation.value.title) {
          activeConversation.value.title = content.length > 60 ? content.slice(0, 57) + '...' : content
        }

        // Update in the conversations list
        const idx = conversations.value.findIndex(c => c.id === activeConversation.value!.id)
        if (idx >= 0) {
          conversations.value[idx] = { ...activeConversation.value }
          // Move to top
          const [moved] = conversations.value.splice(idx, 1)
          conversations.value.unshift(moved)
        }
      }
    } catch (err: any) {
      console.error('Failed to send message:', err)
      // Remove the optimistic user message on failure
      messages.value = messages.value.filter(m => m.id !== tempUserMsg.id)
      throw err
    } finally {
      sending.value = false
    }
  }

  async function archiveConversation(id: string) {
    await $fetch(`/api/agency/ai/chat/conversations/${id}`, { method: 'DELETE' })
    conversations.value = conversations.value.filter(c => c.id !== id)
    totalConversations.value--
    if (activeConversation.value?.id === id) {
      activeConversation.value = null
      messages.value = []
    }
  }

  async function cleanupOldConversations(olderThanDays = 90) {
    const result = await $fetch<{ archivedCount: number; olderThanDays: number }>(
      '/api/agency/ai/chat/conversations/cleanup',
      { method: 'POST', body: { olderThanDays } }
    )
    // Re-fetch the list after cleanup
    if (result.archivedCount > 0) {
      await fetchConversations()
    }
    return result
  }

  async function submitFeedback(messageId: string, rating: -1 | 1, correction?: string, category?: string) {
    try {
      await $fetch(`/api/agency/ai/chat/messages/${messageId}/feedback`, {
        method: 'POST',
        body: { rating, correction, category }
      })
      const msg = messages.value.find(m => m.id === messageId)
      if (msg) {
        msg.feedback = { id: '', messageId, userId: '', rating, correction: correction || null, category: category || null, createdAt: new Date().toISOString() }
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err)
    }
  }

  return {
    conversations,
    activeConversation,
    messages,
    selectedPersona,
    loading,
    sending,
    hasMoreConversations,
    hasMoreMessages,
    totalConversations,
    fetchConversations,
    loadMoreConversations,
    createConversation,
    loadConversation,
    loadMoreMessages,
    renameConversation,
    togglePin,
    sendMessage,
    archiveConversation,
    cleanupOldConversations,
    submitFeedback,
  }
}
