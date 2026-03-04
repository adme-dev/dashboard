/**
 * Composable for AI Code Assistant in Custom HTML Banner Editor.
 * Persists conversations per-instance in localStorage.
 * Supports multiple conversations with history management.
 */

export interface CodeAssistMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  codeBlocks?: { language: 'html' | 'css' | 'javascript' | 'unknown'; code: string; description?: string }[]
  model?: string
  timestamp: number
}

export interface CodeConversation {
  id: string
  title: string
  messages: CodeAssistMessage[]
  createdAt: number
  updatedAt: number
}

export interface CodeContext {
  html: string
  css: string
  js: string
  width: number
  height: number
  templateName?: string
  templateCategory?: string
  variables?: { name: string; label: string; type: string }[]
}

const MAX_CONVERSATIONS = 50

export function useCodeAssistant(instanceId: string) {
  const storageKey = `code-assist-${instanceId}`

  // All conversations for this instance, persisted in localStorage
  const conversations = useLocalStorage<CodeConversation[]>(storageKey, [])
  const activeConversationId = ref<string | null>(
    conversations.value.length > 0 ? conversations.value[0].id : null
  )
  const sending = ref(false)
  const error = ref<string | null>(null)

  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeConversationId.value) ?? null
  )

  const messages = computed(() => activeConversation.value?.messages ?? [])

  function newConversation() {
    const conv: CodeConversation = {
      id: `conv-${Date.now()}`,
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    conversations.value.unshift(conv)
    activeConversationId.value = conv.id

    // Prune old conversations
    if (conversations.value.length > MAX_CONVERSATIONS) {
      conversations.value = conversations.value.slice(0, MAX_CONVERSATIONS)
    }
  }

  function switchConversation(id: string) {
    if (conversations.value.some(c => c.id === id)) {
      activeConversationId.value = id
    }
  }

  function deleteConversation(id: string) {
    const idx = conversations.value.findIndex(c => c.id === id)
    if (idx === -1) return

    conversations.value.splice(idx, 1)

    // If we deleted the active one, switch to the first remaining or null
    if (activeConversationId.value === id) {
      activeConversationId.value = conversations.value.length > 0
        ? conversations.value[0].id
        : null
    }
  }

  function clearCurrentChat() {
    if (activeConversation.value) {
      activeConversation.value.messages = []
      activeConversation.value.updatedAt = Date.now()
    }
    error.value = null
  }

  async function send(prompt: string, context: CodeContext, action?: string) {
    if (!prompt.trim() || sending.value) return

    error.value = null

    // Auto-create a conversation if none active
    if (!activeConversation.value) {
      newConversation()
    }

    const conv = activeConversation.value!

    // Add user message
    const userMsg: CodeAssistMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: prompt.trim(),
      timestamp: Date.now(),
    }
    conv.messages.push(userMsg)

    // Auto-title from first user message
    if (conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = prompt.trim().slice(0, 60) + (prompt.trim().length > 60 ? '...' : '')
    }
    conv.updatedAt = Date.now()

    sending.value = true

    try {
      // Build history from last 6 messages (excluding the just-added one)
      const history = conv.messages
        .slice(-7, -1)
        .map(m => ({ role: m.role, content: m.content }))

      const result = await $fetch('/api/agency/banner-studio/ai/code-assist', {
        method: 'POST',
        body: {
          html: context.html,
          css: context.css,
          js: context.js,
          width: context.width,
          height: context.height,
          templateName: context.templateName,
          templateCategory: context.templateCategory,
          variables: context.variables,
          prompt: prompt.trim(),
          history,
          action,
        },
      })

      const assistantMsg: CodeAssistMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: result.reply,
        codeBlocks: result.codeBlocks,
        model: result.model,
        timestamp: Date.now(),
      }
      conv.messages.push(assistantMsg)
      conv.updatedAt = Date.now()
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || 'Failed to get AI response'
      conv.messages.push({
        id: `msg-${Date.now()}-e`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.value}`,
        timestamp: Date.now(),
      })
      conv.updatedAt = Date.now()
    } finally {
      sending.value = false
    }
  }

  return {
    conversations: readonly(conversations),
    activeConversationId: readonly(activeConversationId),
    activeConversation,
    messages,
    sending: readonly(sending),
    error: readonly(error),
    send,
    newConversation,
    switchConversation,
    deleteConversation,
    clearCurrentChat,
  }
}
