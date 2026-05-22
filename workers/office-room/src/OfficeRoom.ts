import { DurableObject } from 'cloudflare:workers'
import type {
  ActorHandle,
  OfficeParticipant,
  OfficeSnapshot,
  OfficeStatus,
} from '../../../app/types/office'
import type { InboundMessage, OutboundMessage } from './types'

interface Env {
  // bound by the parent worker; no explicit env needed in 1a
}

interface ConnMeta {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: 'admin' | 'member' | 'guest'
  isGuest: boolean
  joinedAt: number
}

interface ParticipantState extends ConnMeta {
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
  disconnectedAt: number | null
}

const GRACE_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 60_000

export class OfficeRoom extends DurableObject<Env> {
  // In-memory participant state keyed by ActorHandle
  private participants = new Map<ActorHandle, ParticipantState>()
  // Map from WS to its handle (so we can find the participant on close)
  private wsToHandle = new WeakMap<WebSocket, ActorHandle>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore handles from hibernation tags so we can attribute message events
    for (const ws of ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle) {
        this.wsToHandle.set(ws, tag.handle)
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const url = new URL(request.url)
    const handle = url.searchParams.get('handle') as ActorHandle | null
    const name = url.searchParams.get('name')
    const avatarUrl = url.searchParams.get('avatarUrl')
    const role = url.searchParams.get('role') as 'admin' | 'member' | 'guest' | null
    const isGuest = url.searchParams.get('isGuest') === 'true'

    if (!handle || !name || !role) {
      return new Response('Missing required params', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ handle })
    this.wsToHandle.set(server, handle)

    const meta: ConnMeta = {
      handle,
      name,
      avatarUrl,
      role,
      isGuest,
      joinedAt: Date.now(),
    }
    this.handleConnect(server, meta)

    return new Response(null, { status: 101, webSocket: client })
  }

  // ---------- Hibernation handlers --------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    if (typeof message !== 'string') return

    let msg: InboundMessage
    try {
      msg = JSON.parse(message) as InboundMessage
    } catch {
      return this.sendTo(ws, { type: 'error', message: 'invalid JSON' })
    }

    await this.handleMessage(handle, ws, msg)
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    this.handleDisconnect(handle)
  }

  async webSocketError(ws: WebSocket, _err: unknown): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    this.handleDisconnect(handle)
  }

  async alarm(): Promise<void> {
    // Fired by setAlarm() for the 30s grace timer. Reap disconnected or silent participants.
    const now = Date.now()
    for (const [handle, p] of this.participants) {
      if (p.disconnectedAt && now - p.disconnectedAt >= GRACE_MS) {
        this.removeParticipant(handle)
        continue
      }
      // Also reap silent participants (no heartbeat in 60s)
      if (!p.disconnectedAt && now - p.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        this.removeParticipant(handle)
      }
    }
    // Schedule next check if anyone's still in grace
    const nextGrace = Array.from(this.participants.values())
      .filter((p) => p.disconnectedAt !== null)
      .map((p) => p.disconnectedAt! + GRACE_MS)
      .sort((a, b) => a - b)[0]
    if (nextGrace) {
      await this.ctx.storage.setAlarm(nextGrace)
    }
  }

  // ---------- Core handlers ---------------------------------------------------

  private handleConnect(ws: WebSocket, meta: ConnMeta): void {
    const existing = this.participants.get(meta.handle)
    if (existing) {
      // Reconnect: clear disconnect timer, refresh ws
      existing.disconnectedAt = null
      existing.lastSeenAt = Date.now()
      this.sendTo(ws, { type: 'snapshot', snapshot: this.buildSnapshot() })
      return
    }

    const participant: ParticipantState = {
      ...meta,
      status: 'available',
      currentZoneId: null,
      lastSeenAt: Date.now(),
      disconnectedAt: null,
    }
    this.participants.set(meta.handle, participant)

    this.sendTo(ws, { type: 'snapshot', snapshot: this.buildSnapshot() })
    this.broadcast(
      {
        type: 'participant:joined',
        handle: meta.handle,
        name: meta.name,
        avatarUrl: meta.avatarUrl,
        status: 'available',
        isGuest: meta.isGuest,
      },
      meta.handle,
    )
  }

  private async handleMessage(
    handle: ActorHandle,
    ws: WebSocket,
    msg: InboundMessage,
  ): Promise<void> {
    const p = this.participants.get(handle)
    if (!p) return
    p.lastSeenAt = Date.now()

    switch (msg.type) {
      case 'heartbeat':
        return
      case 'status:set':
        p.status = msg.status
        this.broadcast({ type: 'participant:updated', handle, status: msg.status })
        return
      case 'zone:enter':
        // 1a: no media token, no ACL check yet (full ACL in 1b/1c). For 1a we trust the API to gate.
        p.currentZoneId = msg.zoneId
        this.sendTo(ws, { type: 'zone:entered', zoneId: msg.zoneId })
        this.broadcast({ type: 'participant:moved', handle, zoneId: msg.zoneId })
        return
      case 'zone:leave':
        p.currentZoneId = null
        this.broadcast({ type: 'participant:moved', handle, zoneId: null })
        return
    }
  }

  private handleDisconnect(handle: ActorHandle): void {
    const p = this.participants.get(handle)
    if (!p) return
    p.disconnectedAt = Date.now()
    // Schedule alarm to reap after grace
    this.ctx.storage.setAlarm(Date.now() + GRACE_MS)
  }

  private removeParticipant(handle: ActorHandle): void {
    if (!this.participants.delete(handle)) return
    this.broadcast({ type: 'participant:left', handle })
  }

  // ---------- Snapshot + broadcast helpers -----------------------------------

  private buildSnapshot(): OfficeSnapshot {
    const participants: OfficeParticipant[] = []
    const zoneOccupancy: Record<string, ActorHandle[]> = {}
    for (const [handle, p] of this.participants) {
      if (p.disconnectedAt !== null) continue
      participants.push({
        handle,
        name: p.name,
        avatarUrl: p.avatarUrl,
        role: p.role,
        status: p.status,
        currentZoneId: p.currentZoneId,
        joinedAt: p.joinedAt,
        isGuest: p.isGuest,
      })
      if (p.currentZoneId) {
        ;(zoneOccupancy[p.currentZoneId] ||= []).push(handle)
      }
    }
    return { officeId: this.ctx.id.toString(), participants, zoneOccupancy }
  }

  private sendTo(ws: WebSocket, msg: OutboundMessage): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* ignore */
    }
  }

  private broadcast(msg: OutboundMessage, exceptHandle?: ActorHandle): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (exceptHandle && tag?.handle === exceptHandle) continue
      try {
        ws.send(JSON.stringify(msg))
      } catch {
        /* ignore */
      }
    }
  }
}
