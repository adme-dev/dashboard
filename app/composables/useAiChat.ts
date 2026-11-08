import type { AiConversation, AiMessage, AiContextSource } from '~/types'
import { watch } from 'vue'
import type { RoleSkillList, RoleSkillShortcut } from '~~/shared/types/roleSkills'
import type { MyAssistantView } from '~~/shared/types/aiAssistant'
import { createAiChatSubmissionBody, postAiChatSubmission } from '~/utils/aiChatTransport'

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
  persona?: string | null
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
  // Null inherits My Assistant; 'general' is a deliberate conversation override.
  const selectedPersona = useState<string | null>('ai-chat-persona', () => null)
  const defaultPersona = useState<string | null>('ai-chat-default-persona', () => null)
  const chatToolsEnabled = useState<boolean | null>('ai-chat-tools-enabled', () => null)
  const workflows = useState<RoleSkillShortcut[]>('ai-chat-workflows', () => [])
  const selectedWorkflow = useState<RoleSkillShortcut | null>('ai-chat-selected-workflow', () => null)
  const workflowError = ref('')
  watch(selectedPersona, (persona) => {
    if (selectedWorkflow.value && selectedWorkflow.value.persona !== persona) selectedWorkflow.value = null
  })
  const loading = ref(false)
  const sending = ref(false)
  const hasMoreConversations = ref(false)
  const hasMoreMessages = ref(false)
  const totalConversations = ref(0)
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown, params?: Record<string, unknown> }
  ) => Promise<T>

  async function loadWorkflows() {
    workflowError.value = ''
    try {
      const catalog = await apiFetch<RoleSkillList>('/api/agency/ai/skills')
      workflows.value = catalog.skills
      if (selectedWorkflow.value && !catalog.skills.some(skill => skill.versionId === selectedWorkflow.value?.versionId)) {
        selectedWorkflow.value = null
      }
    } catch {
      workflows.value = []
      selectedWorkflow.value = null
      workflowError.value = 'Workflows are unavailable. You can still write your own request.'
    }
  }

  function selectWorkflow(workflow: RoleSkillShortcut) {
    const eligible = workflows.value.find(skill => skill.key === workflow.key && skill.versionId === workflow.versionId)
    if (!eligible) return
    selectedPersona.value = eligible.persona
    selectedWorkflow.value = eligible
  }

  function clearWorkflow() {
    selectedWorkflow.value = null
  }

  async function loadAssistantDefaults() {
    try {
      const config = await apiFetch<Pick<MyAssistantView, 'personaKey' | 'chatRuntime'>>('/api/agency/ai/my-assistant')
      defaultPersona.value = config.personaKey ?? 'general'
      chatToolsEnabled.value = config.chatRuntime?.toolsEnabled ?? false
    } catch (err) {
      defaultPersona.value = null
      chatToolsEnabled.value = false
      console.error('Failed to load assistant defaults:', err)
    }
  }

  async function fetchConversations(reset = true) {
    loading.value = true
    try {
      const offset = reset ? 0 : conversations.value.length
      const data = await apiFetch<ConversationListResponse>('/api/agency/ai/chat/conversations', {
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
    const conv = await apiFetch<AiConversation>('/api/agency/ai/chat/conversations', {
      method: 'POST',
      body: { title: title || null },
    })
    if (activeConversation.value) {
      selectedPersona.value = null
      selectedWorkflow.value = null
    }
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
      const data = await apiFetch<ConversationDetail>(`/api/agency/ai/chat/conversations/${id}`)
      activeConversation.value = data.conversation
      messages.value = data.messages
      hasMoreMessages.value = data.hasMore
      selectedPersona.value = data.persona ?? null
      selectedWorkflow.value = null
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
      const data = await apiFetch<ConversationDetail>(
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
    const result = await apiFetch<{ id: string; title: string; updatedAt: string }>(
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
    const result = await apiFetch<{ id: string; isPinned: boolean; pinnedAt: string | null; updatedAt: string }>(
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
      const body: Record<string, any> = createAiChatSubmissionBody({ content })
      if (mentionedEntities && mentionedEntities.length > 0) {
        body.mentionedEntities = mentionedEntities
      }
      if (boardId) body.boardId = boardId
      // Explicit null clears a stored conversation override and restores the personal default.
      body.persona = selectedPersona.value
      if (selectedWorkflow.value) body.workflow = { key: selectedWorkflow.value.key, versionId: selectedWorkflow.value.versionId }
      if (room?.officeId) body.room = room

      const result = await postAiChatSubmission<ChatMessageResponse>(
        apiFetch,
        `/api/agency/ai/chat/conversations/${activeConversation.value.id}/messages`,
        body as ReturnType<typeof createAiChatSubmissionBody>
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
    await apiFetch(`/api/agency/ai/chat/conversations/${id}`, { method: 'DELETE' })
    conversations.value = conversations.value.filter(c => c.id !== id)
    totalConversations.value--
    if (activeConversation.value?.id === id) {
      activeConversation.value = null
      selectedPersona.value = null
      selectedWorkflow.value = null
      messages.value = []
    }
  }

  async function cleanupOldConversations(olderThanDays = 90) {
    const result = await apiFetch<{ archivedCount: number; olderThanDays: number }>(
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
      await apiFetch(`/api/agency/ai/chat/messages/${messageId}/feedback`, {
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
    workflows,
    selectedWorkflow,
    workflowError,
    loadWorkflows,
    selectWorkflow,
    clearWorkflow,
    conversations,
    activeConversation,
    messages,
    selectedPersona,
    defaultPersona,
    chatToolsEnabled,
    loadAssistantDefaults,
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
