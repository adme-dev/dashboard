/**
 * BannerRoom Durable Object
 *
 * Real-time banner collaboration using Hibernatable WebSocket API.
 * BIDIRECTIONAL: client->client relay for cursors, layer locks, and live edits.
 * Based on BoardRoom pattern but extended for collaborative editing.
 */

import { DurableObject } from 'cloudflare:workers'

interface BannerConnectionMeta {
  userId: string
  userName: string
  userAvatar?: string
  color: string
  projectId: string
}

interface Env {}

const COLLAB_COLORS = ['#e84aff', '#4ae8a0', '#e8a04a', '#4a8fe8', '#e84a4a', '#a04ae8', '#e8e84a', '#4ae8e8']
const LOCK_STALE_MS = 30_000

export class BannerRoom extends DurableObject<Env> {
  private layerLocks: Map<number, { userId: string; userName: string; color: string; lockedAt: number }> = new Map()
  private colorIndex = 0
  private lastHeartbeat: Map<string, number> = new Map()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/presence')) {
      return Response.json({ users: this.getOnlineUsers() })
    }

    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    return this.handleWebSocket(request)
  }

  private handleWebSocket(request: Request): Response {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId') || 'anonymous'
    const userName = url.searchParams.get('userName') || 'Anonymous'
    const userAvatar = url.searchParams.get('userAvatar') || undefined
    const projectId = url.pathname.split('/')[2] || 'unknown'
    const color = COLLAB_COLORS[this.colorIndex++ % COLLAB_COLORS.length]

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    const meta: BannerConnectionMeta = { userId, userName, userAvatar, color, projectId }
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(meta)
    this.lastHeartbeat.set(userId, Date.now())

    // Send history (current locks + users + assigned color)
    server.send(JSON.stringify({
      type: 'history',
      locks: Object.fromEntries(this.layerLocks),
      users: this.getOnlineUsers(),
      myColor: color,
    }))

    // Broadcast updated presence
    this.broadcastPresence()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const meta = ws.deserializeAttachment() as BannerConnectionMeta
      if (!meta?.userId) return
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))

      switch (data.type) {
        case 'cursor_move':
          this.broadcastToOthers(ws, {
            type: 'cursor',
            userId: meta.userId,
            userName: meta.userName,
            color: meta.color,
            x: data.x,
            y: data.y,
            formatKey: data.formatKey,
          })
          break

        case 'layer_select':
          this.handleLayerSelect(meta, data.layerId, data.formatKey)
          break

        case 'layer_update':
          this.broadcastToOthers(ws, {
            type: 'layer_updated',
            userId: meta.userId,
            layerId: data.layerId,
            formatKey: data.formatKey,
            props: data.props,
          })
          break

        case 'layer_add':
          this.broadcastToOthers(ws, {
            type: 'layer_added',
            userId: meta.userId,
            layer: data.layer,
            formatKey: data.formatKey,
          })
          break

        case 'layer_remove':
          this.broadcastToOthers(ws, {
            type: 'layer_removed',
            userId: meta.userId,
            layerId: data.layerId,
            formatKey: data.formatKey,
          })
          break

        case 'layer_reorder':
          this.broadcastToOthers(ws, {
            type: 'layer_reordered',
            userId: meta.userId,
            layerId: data.layerId,
            formatKey: data.formatKey,
            newZIndex: data.newZIndex,
          })
          break

        case 'heartbeat':
          this.lastHeartbeat.set(meta.userId, Date.now())
          this.cleanStaleLocks()
          break
      }
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    try {
      const meta = ws.deserializeAttachment() as BannerConnectionMeta
      if (meta?.userId) {
        this.releaseUserLocks(meta.userId)
        this.lastHeartbeat.delete(meta.userId)
      }
    } catch {}
    try { ws.close(code, reason) } catch {}
    this.broadcastPresence()
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    try {
      const meta = ws.deserializeAttachment() as BannerConnectionMeta
      if (meta?.userId) {
        this.releaseUserLocks(meta.userId)
        this.lastHeartbeat.delete(meta.userId)
      }
    } catch {}
    try { ws.close(1011, 'WebSocket error') } catch {}
    this.broadcastPresence()
  }

  private handleLayerSelect(meta: BannerConnectionMeta, layerId: number | null, formatKey: string): void {
    // Release any existing locks by this user
    const released: number[] = []
    for (const [lid, lock] of this.layerLocks) {
      if (lock.userId === meta.userId) {
        this.layerLocks.delete(lid)
        released.push(lid)
      }
    }
    released.forEach(lid => {
      this.broadcast({ type: 'layer_unlocked', layerId: lid })
    })

    // Acquire new lock if selecting a layer
    if (layerId !== null) {
      this.layerLocks.set(layerId, {
        userId: meta.userId,
        userName: meta.userName,
        color: meta.color,
        lockedAt: Date.now(),
      })
      this.broadcast({
        type: 'layer_locked',
        layerId,
        userId: meta.userId,
        userName: meta.userName,
        color: meta.color,
      })
    }
  }

  private releaseUserLocks(userId: string): void {
    const released: number[] = []
    for (const [lid, lock] of this.layerLocks) {
      if (lock.userId === userId) {
        this.layerLocks.delete(lid)
        released.push(lid)
      }
    }
    released.forEach(lid => {
      this.broadcast({ type: 'layer_unlocked', layerId: lid })
    })
  }

  private cleanStaleLocks(): void {
    const now = Date.now()
    const stale: number[] = []
    for (const [lid, lock] of this.layerLocks) {
      const lastHb = this.lastHeartbeat.get(lock.userId) || 0
      if (now - lastHb > LOCK_STALE_MS) {
        stale.push(lid)
      }
    }
    stale.forEach(lid => {
      this.layerLocks.delete(lid)
      this.broadcast({ type: 'layer_unlocked', layerId: lid })
    })
  }

  private getOnlineUsers(): Array<{ userId: string; userName: string; userAvatar?: string; color: string }> {
    const users = new Map<string, { userId: string; userName: string; userAvatar?: string; color: string }>()
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const meta = ws.deserializeAttachment() as BannerConnectionMeta
        if (meta?.userId) {
          users.set(meta.userId, {
            userId: meta.userId,
            userName: meta.userName,
            userAvatar: meta.userAvatar,
            color: meta.color,
          })
        }
      } catch {}
    }
    return Array.from(users.values())
  }

  private broadcast(message: object): void {
    const json = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(json) } catch {}
    }
  }

  private broadcastToOthers(sender: WebSocket, message: object): void {
    const json = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === sender) continue
      try { ws.send(json) } catch {}
    }
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', users: this.getOnlineUsers() })
  }
}
