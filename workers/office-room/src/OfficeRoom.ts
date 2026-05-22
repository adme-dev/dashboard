import { DurableObject } from 'cloudflare:workers'
import type {
  ActorHandle,
  OfficeParticipant,
  OfficeSnapshot,
  OfficeStatus,
} from '../../../app/types/office'
import type { InboundMessage, OutboundMessage } from './types'
import { applyStatusSet, applyZoneEnter, applyZoneLeave } from './handlers'

interface Env {
  /** Base URL of the Pages app, e.g. https://agency-dashboard-6cm.pages.dev */
  SYNC_BASE_URL?: string
  /** Shared secret for the chat-presence sync endpoint */
  OFFICE_SYNC_SECRET?: string
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
  // Pending 5s-debounced status syncs to the Pages chat-presence endpoint
  private syncTimers = new Map<ActorHandle, ReturnType<typeof setTimeout>>()

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

    const now = Date.now()
    switch (msg.type) {
      case 'heartbeat':
        return
      case 'status:set': {
        const { broadcast } = applyStatusSet(p, msg.status, now)
        this.broadcast(broadcast)
        this.scheduleStatusSync(handle, msg.status)
        return
      }
      case 'zone:enter': {
        // 1a: no media token, no ACL check yet (full ACL in 1b/1c).
        // The Nitro WS endpoint gates membership; the DO trusts the upgrade.
        const { send, broadcast } = applyZoneEnter(p, msg.zoneId, now)
        this.sendTo(ws, send)
        this.broadcast(broadcast)
        return
      }
      case 'zone:leave': {
        const { broadcast } = applyZoneLeave(p, now)
        this.broadcast(broadcast)
        return
      }
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

  // ---------- Chat-presence write-through (5s debounce) ---------------------

  private scheduleStatusSync(handle: ActorHandle, status: OfficeStatus): void {
    const existing = this.syncTimers.get(handle)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => this.syncStatus(handle, status), 5_000)
    this.syncTimers.set(handle, t)
  }

  private async syncStatus(handle: ActorHandle, status: OfficeStatus): Promise<void> {
    this.syncTimers.delete(handle)
    const env = this.env
    if (!env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return

    const [type, id] = handle.split(':') as ['user' | 'client', string]
    try {
      await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/sync-status`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-office-sync-secret': env.OFFICE_SYNC_SECRET,
        },
        body: JSON.stringify({ actor_type: type, actor_id: id, status }),
      })
    } catch {
      /* best-effort; chat presence is non-critical */
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
