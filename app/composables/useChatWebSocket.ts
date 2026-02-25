/**
 * Composable for WebSocket connection to chat channels.
 * Follows the useTaskWebSocket.ts pattern.
 * Connects to ChatRoom Durable Object via /api/chat/:channelId/connect
 */

export interface ChatWsMessage {
  type: 'message' | 'typing' | 'edit' | 'delete' | 'reaction' | 'presence' | 'history' | 'error'
  // Message fields
  id?: number
  userId?: string
  userName?: string
  userAvatar?: string
  content?: string
  threadParentId?: number | null
  replyToId?: number | null
  metadata?: Record<string, unknown>
  createdAt?: string
  // Edit
  messageId?: number
  editedAt?: string
  // Reaction
  reactions?: Array<{ emoji: string; userIds: string[]; count: number }>
  // Presence
  event?: string
  activeUsers?: Array<{ userId: string; userName: string; userAvatar?: string }>
  isTyping?: boolean
  // History (initial load)
  messages?: ChatWsMessage[]
  // Error
  error?: string
}

export function useChatWebSocket(channelId: string) {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const activeUsers = ref<Array<{ userId: string; userName: string; userAvatar?: string }>>([])
  const typingUsers = ref<Map<string, { userName: string; timeout: ReturnType<typeof setTimeout> }>>(new Map())

  const messageHandlers = new Set<(msg: ChatWsMessage) => void>()

  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let connectArgs: { userId: string; userName: string; userAvatar?: string } | null = null

  const connect = (userId: string, userName: string, userAvatar?: string) => {
    if (ws.value?.readyState === WebSocket.OPEN) return
    if (isConnecting.value) return

    connectArgs = { userId, userName, userAvatar }
    isConnecting.value = true
    error.value = null

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const params = new URLSearchParams({ userId, userName })
      if (userAvatar) params.set('userAvatar', userAvatar)

      const wsUrl = `${protocol}//${window.location.host}/api/chat/${channelId}/connect?${params}`

      ws.value = new WebSocket(wsUrl)

      ws.value.onopen = () => {
        isConnected.value = true
        isConnecting.value = false
        reconnectAttempts = 0
      }

      ws.value.onmessage = (event) => {
        try {
          const message: ChatWsMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch {
          // Ignore malformed messages
        }
      }

      ws.value.onerror = () => {
        error.value = 'WebSocket error occurred'
        isConnecting.value = false
      }

      ws.value.onclose = () => {
        isConnected.value = false
        isConnecting.value = false
        ws.value = null

        // Exponential backoff: 3s, 6s, 12s, max 30s
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempts), 30000)
        reconnectAttempts++

        reconnectTimer = setTimeout(() => {
          if (!isConnected.value && !isConnecting.value && connectArgs) {
            connect(connectArgs.userId, connectArgs.userName, connectArgs.userAvatar)
          }
        }, delay)
      }
    } catch {
      error.value = 'Failed to connect'
      isConnecting.value = false
    }
  }

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    connectArgs = null
    reconnectAttempts = 0
    if (ws.value) {
      ws.value.close()
      ws.value = null
      isConnected.value = false
    }
  }

  const send = (message: Record<string, unknown>): boolean => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    ws.value.send(JSON.stringify(message))
    return true
  }

  const sendMessage = (content: string, threadParentId?: number, metadata?: Record<string, unknown>) => {
    return send({
      type: 'message',
      content,
      threadParentId: threadParentId ?? null,
      metadata: metadata ?? {}
    })
  }

  const sendEdit = (messageId: number, content: string) => {
    return send({ type: 'edit', messageId, content })
  }

  const sendDelete = (messageId: number) => {
    return send({ type: 'delete', messageId })
  }

  const sendReaction = (messageId: number, emoji: string) => {
    return send({ type: 'reaction', messageId, emoji })
  }

  let typingThrottle: ReturnType<typeof setTimeout> | null = null
  const sendTyping = () => {
    if (typingThrottle) return
    send({ type: 'typing' })
    typingThrottle = setTimeout(() => { typingThrottle = null }, 2000)
  }

  const handleMessage = (message: ChatWsMessage) => {
    switch (message.type) {
      case 'presence':
        if (message.activeUsers) {
          activeUsers.value = message.activeUsers
        }
        break

      case 'typing':
        if (message.userId && message.userName) {
          // Clear existing timeout for this user
          const existing = typingUsers.value.get(message.userId)
          if (existing) clearTimeout(existing.timeout)

          const timeout = setTimeout(() => {
            typingUsers.value.delete(message.userId!)
          }, 3000)

          typingUsers.value.set(message.userId, { userName: message.userName, timeout })
        }
        break
    }

    // Notify all handlers
    messageHandlers.forEach(handler => handler(message))
  }

  const onMessage = (handler: (msg: ChatWsMessage) => void) => {
    messageHandlers.add(handler)
    return () => { messageHandlers.delete(handler) }
  }

  const typingText = computed(() => {
    const users = [...typingUsers.value.values()].map(u => u.userName)
    if (users.length === 0) return ''
    if (users.length === 1) return `${users[0]} is typing...`
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`
    return `${users.length} people are typing...`
  })

  onUnmounted(() => {
    // Clear typing timeouts
    for (const entry of typingUsers.value.values()) {
      clearTimeout(entry.timeout)
    }
    disconnect()
  })

  return {
    ws: readonly(ws),
    isConnected: readonly(isConnected),
    isConnecting: readonly(isConnecting),
    error: readonly(error),
    activeUsers: readonly(activeUsers),
    typingUsers,
    typingText,
    connect,
    disconnect,
    send,
    sendMessage,
    sendEdit,
    sendDelete,
    sendReaction,
    sendTyping,
    onMessage
  }
}
