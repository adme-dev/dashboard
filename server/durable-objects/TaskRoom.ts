/**
 * Cloudflare Durable Object for Real-Time Task Comments
 * 
 * Each task gets its own Durable Object instance.
 * Handles WebSocket connections and broadcasts updates.
 */

export interface TaskMessage {
  type: 'comment' | 'like' | 'edit' | 'delete' | 'typing' | 'presence'
  taskId: string
  commentId?: string
  userId: string
  userName: string
  userAvatar?: string
  content?: string
  timestamp: number
  data?: any
}

export interface ConnectedClient {
  ws: WebSocket
  userId: string
  userName: string
  joinedAt: number
}

export class TaskRoom {
  private state: DurableObjectState
  private clients: Map<WebSocket, ConnectedClient> = new Map()
  private recentMessages: TaskMessage[] = []
  private readonly MAX_RECENT_MESSAGES = 50
  
  constructor(state: DurableObjectState) {
    this.state = state
  }

  /**
   * Handle HTTP requests (WebSocket upgrade)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    // Get task ID from URL
    const taskId = url.pathname.split('/').pop()
    if (!taskId) {
      return new Response('Task ID required', { status: 400 })
    }

    // Verify upgrade header
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 })
    }

    // Parse user info from query params or JWT
    const userId = url.searchParams.get('userId')
    const userName = url.searchParams.get('userName') || 'Anonymous'
    const userAvatar = url.searchParams.get('userAvatar') || undefined

    if (!userId) {
      return new Response('User ID required', { status: 401 })
    }

    // Create WebSocket pair
    const [clientWs, serverWs] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]

    // Accept the WebSocket
    this.state.acceptWebSocket(serverWs)

    // Store client info
    this.clients.set(serverWs, {
      ws: serverWs,
      userId,
      userName,
      joinedAt: Date.now()
    })

    // Send recent message history to new client
    if (this.recentMessages.length > 0) {
      serverWs.send(JSON.stringify({
        type: 'history',
        messages: this.recentMessages
      }))
    }

    // Broadcast user joined
    this.broadcast({
      type: 'presence',
      taskId,
      userId,
      userName,
      userAvatar,
      timestamp: Date.now(),
      data: { event: 'joined', activeUsers: this.getActiveUsers() }
    }, serverWs) // Exclude sender

    // Handle messages
    serverWs.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string) as TaskMessage
        await this.handleMessage(serverWs, message)
      } catch (err) {
        console.error('Failed to handle message:', err)
        serverWs.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format'
        }))
      }
    })

    // Handle close
    serverWs.addEventListener('close', () => {
      this.handleDisconnect(serverWs, taskId)
    })

    // Return client WebSocket
    return new Response(null, {
      status: 101,
      webSocket: clientWs
    } as any)
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(ws: WebSocket, message: TaskMessage): Promise<void> {
    const client = this.clients.get(ws)
    if (!client) return

    // Add server timestamp
    message.timestamp = Date.now()
    message.userName = client.userName

    switch (message.type) {
      case 'comment':
      case 'edit':
      case 'delete':
      case 'like':
        // Store in recent messages
        this.addToRecentMessages(message)
        
        // Broadcast to all clients (including sender for confirmation)
        this.broadcast(message)
        
        // Also persist to Neon (async, don't block)
        this.persistToDatabase(message).catch(console.error)
        break

      case 'typing':
        // Broadcast typing indicator (don't persist)
        this.broadcast({
          ...message,
          data: { userName: client.userName, isTyping: message.data?.isTyping }
        }, ws) // Exclude sender
        break

      case 'presence':
        // Handle presence ping
        ws.send(JSON.stringify({
          type: 'presence',
          data: { activeUsers: this.getActiveUsers() }
        }))
        break

      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: `Unknown message type: ${message.type}`
        }))
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: WebSocket, taskId: string): void {
    const client = this.clients.get(ws)
    if (!client) return

    this.clients.delete(ws)

    // Broadcast user left
    this.broadcast({
      type: 'presence',
      taskId,
      userId: client.userId,
      userName: client.userName,
      timestamp: Date.now(),
      data: { event: 'left', activeUsers: this.getActiveUsers() }
    })
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: TaskMessage, excludeWs?: WebSocket): void {
    const messageStr = JSON.stringify(message)
    
    this.clients.forEach((client, ws) => {
      if (ws !== excludeWs && ws.readyState === WebSocket.READY_STATE_OPEN) {
        try {
          ws.send(messageStr)
        } catch (err) {
          console.error('Failed to send to client:', err)
        }
      }
    })
  }

  /**
   * Get list of active users
   */
  private getActiveUsers(): Array<{ userId: string; userName: string }> {
    const users = new Map()
    this.clients.forEach(client => {
      users.set(client.userId, { userId: client.userId, userName: client.userName })
    })
    return Array.from(users.values())
  }

  /**
   * Add message to recent history
   */
  private addToRecentMessages(message: TaskMessage): void {
    this.recentMessages.push(message)
    if (this.recentMessages.length > this.MAX_RECENT_MESSAGES) {
      this.recentMessages.shift()
    }
  }

  /**
   * Persist message to Neon database
   * This ensures durability even if the DO is destroyed
   */
  private async persistToDatabase(message: TaskMessage): Promise<void> {
    // This would call your existing API endpoints
    // or write directly to Neon using the database connection
    
    // Example: Call the existing API
    const apiUrl = process.env.API_URL || 'http://localhost:3000'
    
    try {
      switch (message.type) {
        case 'comment':
          await fetch(`${apiUrl}/api/tasks/${message.taskId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: message.content,
              parentId: message.data?.parentId
            })
          })
          break
          
        case 'like':
          await fetch(`${apiUrl}/api/comments/${message.commentId}/like`, {
            method: 'POST'
          })
          break
          
        case 'edit':
          await fetch(`${apiUrl}/api/comments/${message.commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message.content })
          })
          break
          
        case 'delete':
          await fetch(`${apiUrl}/api/comments/${message.commentId}`, {
            method: 'DELETE'
          })
          break
      }
    } catch (err) {
      console.error('Failed to persist to database:', err)
      // Don't throw - WebSocket should continue working even if DB write fails
      // Consider retry logic or dead letter queue
    }
  }
}

// WebSocket ready states (for TypeScript)
const WebSocket = {
  READY_STATE_CONNECTING: 0,
  READY_STATE_OPEN: 1,
  READY_STATE_CLOSING: 2,
  READY_STATE_CLOSED: 3
}
