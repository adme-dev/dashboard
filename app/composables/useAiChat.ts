import type { AiConversation, AiMessage, AiContextSource } from '~/types'

interface ConversationDetail {
  conversation: AiConversation
  messages: AiMessage[]
}

interface ChatMessageResponse {
  message: AiMessage
  contextSources: AiContextSource[]
}

export function useAiChat() {
  const conversations = ref<AiConversation[]>([])
  const activeConversation = ref<AiConversation | null>(null)
  const messages = ref<AiMessage[]>([])
  const loading = ref(false)
  const sending = ref(false)

  async function fetchConversations() {
    loading.value = true
    try {
      conversations.value = await $fetch<AiConversation[]>('/api/agency/ai/chat/conversations')
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      loading.value = false
    }
  }

  async function createConversation(title?: string): Promise<AiConversation> {
    const conv = await $fetch<AiConversation>('/api/agency/ai/chat/conversations', {
      method: 'POST',
      body: { title: title || null },
    })
    conversations.value.unshift(conv)
    activeConversation.value = conv
    messages.value = []
    return conv
  }

  async function loadConversation(id: string) {
    loading.value = true
    try {
      const data = await $fetch<ConversationDetail>(`/api/agency/ai/chat/conversations/${id}`)
      activeConversation.value = data.conversation
      messages.value = data.messages
    } catch (err) {
      console.error('Failed to load conversation:', err)
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(content: string) {
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
      const result = await $fetch<ChatMessageResponse>(
        `/api/agency/ai/chat/conversations/${activeConversation.value.id}/messages`,
        {
          method: 'POST',
          body: { content },
        }
      )

      // Replace temp user message with real one (the server saved it)
      // The server returns the assistant message; the user message was already added optimistically
      messages.value.push(result.message)

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
    if (activeConversation.value?.id === id) {
      activeConversation.value = null
      messages.value = []
    }
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
    loading,
    sending,
    fetchConversations,
    createConversation,
    loadConversation,
    sendMessage,
    archiveConversation,
    submitFeedback,
  }
}
