/**
 * BoardRoom Durable Object
 *
 * Real-time board event broadcasting using Hibernatable WebSocket API.
 * No SQLite — events are stored in-memory with TTL-based expiry.
 * Much simpler than ChatRoom: events flow server->client only.
 */

import { DurableObject } from 'cloudflare:workers'

interface ConnectionMeta {
  userId: string
  userName: string
  userAvatar?: string
  boardId: string
}

interface BoardEvent {
  id: number
  type: string
  taskId?: string
  columnId?: string
  userId?: string
  changes?: Record<string, any>
  timestamp: number
}

interface Env {}

const MAX_EVENTS = 200
const EVENT_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class BoardRoom extends DurableObject<Env> {
  private events: BoardEvent[] = []
  private eventCounter = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // POST /emit — receive event from main app, store + broadcast
    if (request.method === 'POST' && url.pathname.endsWith('/emit')) {
      return this.handleEmit(request)
    }

    // GET /presence — return online users
    if (url.pathname.endsWith('/presence')) {
      return Response.json({ users: this.getOnlineUsers() })
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade or POST /emit', { status: 426 })
    }

    return this.handleWebSocket(request)
  }

  private async handleEmit(request: Request): Promise<Response> {
    try {
      const event = await request.json() as Omit<BoardEvent, 'id'>
      const stored: BoardEvent = {
        ...event,
        id: ++this.eventCounter,
        timestamp: event.timestamp || Date.now(),
      }

      this.events.push(stored)
      this.trimOldEvents()

      // Broadcast to all connected WebSocket clients
      this.broadcast({
        type: 'board_update',
        event: stored,
      })

      return Response.json({ ok: true, eventId: stored.id })
    } catch (err) {
      return Response.json({ error: 'Invalid event data' }, { status: 400 })
    }
  }

  private handleWebSocket(request: Request): Response {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId') || 'anonymous'
    const userName = url.searchParams.get('userName') || 'Anonymous'
    const userAvatar = url.searchParams.get('userAvatar') || undefined
    const boardId = url.pathname.split('/')[2] || 'unknown'

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    const meta: ConnectionMeta = { userId, userName, userAvatar, boardId }
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(meta)

    // Send recent events as history
    server.send(JSON.stringify({
      type: 'history',
      events: this.events,
      lastEventId: this.eventCounter,
    }))

    // Broadcast presence join
    this.broadcastPresence()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Board events are server->client only.
    // Only handle presence requests from clients.
    try {
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
      if (data.type === 'presence') {
        ws.send(JSON.stringify({
          type: 'presence',
          users: this.getOnlineUsers(),
        }))
      }
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // Hibernatable WebSocket is already closed when this fires — do NOT call ws.close() again.
    // Reflecting abnormal codes (e.g. 1006 from a network drop) back via ws.close() throws
    // InvalidAccessError and crashes the DO, which Cloudflare surfaces as 503 on subsequent requests.
    this.broadcastPresence()
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    try { ws.close(1011, 'WebSocket error') } catch {}
    this.broadcastPresence()
  }

  private getOnlineUsers(): Array<{ userId: string; userName: string; userAvatar?: string }> {
    const users = new Map<string, { userId: string; userName: string; userAvatar?: string }>()
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const meta = ws.deserializeAttachment() as ConnectionMeta
        if (meta?.userId) {
          users.set(meta.userId, {
            userId: meta.userId,
            userName: meta.userName,
            userAvatar: meta.userAvatar,
          })
        }
      } catch {}
    }
    return Array.from(users.values())
  }

  private broadcast(message: object): void {
    const json = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(json)
      } catch {
        // Client disconnected
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast({
      type: 'presence',
      users: this.getOnlineUsers(),
    })
  }

  private trimOldEvents(): void {
    const cutoff = Date.now() - EVENT_TTL_MS
    while (this.events.length > 0 && (this.events.length > MAX_EVENTS || this.events[0].timestamp < cutoff)) {
      this.events.shift()
    }
  }
}
