/**
 * Composable for WebSocket connection to task comments
 * Works with Cloudflare Durable Objects
 */

import type { Comment } from './useTaskComments'

export interface WebSocketMessage {
  type: 'comment' | 'like' | 'edit' | 'delete' | 'typing' | 'presence' | 'history' | 'error'
  taskId: string
  commentId?: string
  userId?: string
  userName?: string
  userAvatar?: string
  content?: string
  timestamp?: number
  data?: any
  messages?: WebSocketMessage[]
  error?: string
}

export function useTaskWebSocket(taskId: string) {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const activeUsers = ref<Array<{ userId: string; userName: string }>>([])
  const typingUsers = ref<Map<string, string>>(new Map())
  
  // Event handlers
  const messageHandlers = new Set<(msg: WebSocketMessage) => void>()
  
  // Connect to WebSocket
  const connect = async (userId: string, userName: string, userAvatar?: string) => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected')
      return
    }
    
    if (isConnecting.value) {
      console.log('[WebSocket] Already connecting')
      return
    }
    
    isConnecting.value = true
    error.value = null
    
    try {
      // Build WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/ws/tasks/${taskId}?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}${userAvatar ? `&userAvatar=${encodeURIComponent(userAvatar)}` : ''}`
      
      console.log('[WebSocket] Connecting to:', wsUrl)
      
      ws.value = new WebSocket(wsUrl)
      
      ws.value.onopen = () => {
        console.log('[WebSocket] Connected')
        isConnected.value = true
        isConnecting.value = false
      }
      
      ws.value.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }
      
      ws.value.onerror = (err) => {
        console.error('[WebSocket] Error:', err)
        error.value = 'WebSocket error occurred'
        isConnecting.value = false
      }
      
      ws.value.onclose = () => {
        console.log('[WebSocket] Disconnected')
        isConnected.value = false
        isConnecting.value = false
        ws.value = null
        
        // Auto-reconnect after 3 seconds
        setTimeout(() => {
          if (!isConnected.value && !isConnecting.value) {
            console.log('[WebSocket] Attempting reconnect...')
            connect(userId, userName, userAvatar)
          }
        }, 3000)
      }
      
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err)
      error.value = 'Failed to connect to WebSocket'
      isConnecting.value = false
    }
  }
  
  // Disconnect
  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
      ws.value = null
      isConnected.value = false
    }
  }
  
  // Send message
  const send = (message: Omit<WebSocketMessage, 'timestamp'>) => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Not connected')
      return false
    }
    
    ws.value.send(JSON.stringify({
      ...message,
      taskId,
      timestamp: Date.now()
    }))
    
    return true
  }
  
  // Send comment
  const sendComment = (content: string, parentId?: string) => {
    return send({
      type: 'comment',
      taskId,
      content,
      data: { parentId }
    })
  }
  
  // Send like
  const sendLike = (commentId: string) => {
    return send({
      type: 'like',
      taskId,
      commentId
    })
  }
  
  // Send edit
  const sendEdit = (commentId: string, content: string) => {
    return send({
      type: 'edit',
      taskId,
      commentId,
      content
    })
  }
  
  // Send delete
  const sendDelete = (commentId: string) => {
    return send({
      type: 'delete',
      taskId,
      commentId
    })
  }
  
  // Send typing indicator
  const sendTyping = (isTyping: boolean) => {
    return send({
      type: 'typing',
      taskId,
      data: { isTyping }
    })
  }
  
  // Handle incoming messages
  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'presence':
        if (message.data?.activeUsers) {
          activeUsers.value = message.data.activeUsers
        }
        if (message.data?.event === 'joined' || message.data?.event === 'left') {
          // Could show toast notification
          console.log(`[WebSocket] ${message.userName} ${message.data.event}`)
        }
        break
        
      case 'typing':
        if (message.data?.isTyping) {
          typingUsers.value.set(message.userId!, message.userName!)
        } else {
          typingUsers.value.delete(message.userId!)
        }
        break
        
      case 'history':
        // Handle message history on initial connect
        console.log('[WebSocket] Received history:', message.messages?.length, 'messages')
        break
    }
    
    // Notify all handlers
    messageHandlers.forEach(handler => handler(message))
  }
  
  // Subscribe to messages
  const onMessage = (handler: (msg: WebSocketMessage) => void) => {
    messageHandlers.add(handler)
    
    // Return unsubscribe function
    return () => {
      messageHandlers.delete(handler)
    }
  }
  
  // Computed: Typing indicator text
  const typingText = computed(() => {
    const users = Array.from(typingUsers.value.values())
    if (users.length === 0) return ''
    if (users.length === 1) return `${users[0]} is typing...`
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`
    return `${users.length} people are typing...`
  })
  
  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })
  
  return {
    ws,
    isConnected,
    isConnecting,
    error,
    activeUsers,
    typingUsers,
    typingText,
    connect,
    disconnect,
    send,
    sendComment,
    sendLike,
    sendEdit,
    sendDelete,
    sendTyping,
    onMessage
  }
}
