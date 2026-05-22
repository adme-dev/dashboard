import { DurableObject } from 'cloudflare:workers'
import type {
  ActorHandle,
  OfficeParticipant,
  OfficeSnapshot,
  OfficeStatus
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore handles AND participant identity from hibernation tags. Without
    // rehydrating `participants`, post-wakeup messages on existing WSs would
    // find no participant entry and silently drop status/zone changes.
    // Note: ephemeral state (status, currentZoneId) resets to defaults across
    // hibernation — only the identity (ConnMeta) is durable in attachments.
    const now = Date.now()
    for (const ws of ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as Partial<ConnMeta> | undefined
      if (!tag?.handle) continue
      this.wsToHandle.set(ws, tag.handle)
      if (!this.participants.has(tag.handle)) {
        this.participants.set(tag.handle, {
          handle: tag.handle,
          name: tag.name ?? 'Unknown',
          avatarUrl: tag.avatarUrl ?? null,
          role: tag.role ?? 'member',
          isGuest: tag.isGuest ?? false,
          joinedAt: tag.joinedAt ?? now,
          status: 'available',
          currentZoneId: null,
          lastSeenAt: now,
          disconnectedAt: null
        })
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
    const meta: ConnMeta = {
      handle,
      name,
      avatarUrl,
      role,
      isGuest,
      joinedAt: Date.now()
    }
    // Persist full identity in the attachment so the participants Map can be
    // rebuilt verbatim after DO hibernation.
    server.serializeAttachment(meta)
    this.wsToHandle.set(server, handle)
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
    _wasClean: boolean
  ): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    await this.handleDisconnect(handle, ws)
  }

  async webSocketError(ws: WebSocket, _err: unknown): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    await this.handleDisconnect(handle, ws)
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
      .filter(p => p.disconnectedAt !== null)
      .map(p => p.disconnectedAt! + GRACE_MS)
      .sort((a, b) => a - b)[0]
    if (nextGrace) {
      await this.ctx.storage.setAlarm(nextGrace)
    }
  }

  // ---------- Core handlers ---------------------------------------------------

  private handleConnect(ws: WebSocket, meta: ConnMeta): void {
    const existing = this.participants.get(meta.handle)
    if (existing) {
      const wasDisconnected = existing.disconnectedAt !== null
      existing.disconnectedAt = null
      existing.lastSeenAt = Date.now()
      this.sendTo(ws, { type: 'snapshot', snapshot: this.buildSnapshot() })
      // If this was a within-grace reconnect, peers that joined during the
      // grace window never saw this participant in their snapshot. Re-announce.
      if (wasDisconnected) {
        this.broadcast(
          {
            type: 'participant:joined',
            handle: meta.handle,
            name: existing.name,
            avatarUrl: existing.avatarUrl,
            role: existing.role,
            status: existing.status,
            isGuest: existing.isGuest
          },
          meta.handle
        )
      }
      return
    }

    const participant: ParticipantState = {
      ...meta,
      status: 'available',
      currentZoneId: null,
      lastSeenAt: Date.now(),
      disconnectedAt: null
    }
    this.participants.set(meta.handle, participant)

    this.sendTo(ws, { type: 'snapshot', snapshot: this.buildSnapshot() })
    this.broadcast(
      {
        type: 'participant:joined',
        handle: meta.handle,
        name: meta.name,
        avatarUrl: meta.avatarUrl,
        role: meta.role,
        status: 'available',
        isGuest: meta.isGuest
      },
      meta.handle
    )
  }

  private async handleMessage(
    handle: ActorHandle,
    ws: WebSocket,
    msg: InboundMessage
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
        // Fire the chat-presence sync via waitUntil so it survives even if the
        // message handler returns before fetch settles. Previously this was
        // a setTimeout debounce, which was lost on DO hibernation.
        this.ctx.waitUntil(this.syncStatus(handle, msg.status))
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

  /**
   * Called from webSocketClose / webSocketError. If the actor has other
   * tabs still attached, don't mark the participant as disconnected — the
   * 30s grace eviction would otherwise kill a live multi-tab user.
   * Marked async so the setAlarm Promise is properly awaited (alarms
   * scheduled via fire-and-forget can be dropped if the isolate yields).
   */
  private async handleDisconnect(handle: ActorHandle, closingWs?: WebSocket): Promise<void> {
    const p = this.participants.get(handle)
    if (!p) return
    if (this.hasOtherActiveSocket(handle, closingWs)) return
    p.disconnectedAt = Date.now()
    await this.ctx.storage.setAlarm(Date.now() + GRACE_MS)
  }

  private hasOtherActiveSocket(handle: ActorHandle, exclude?: WebSocket): boolean {
    for (const other of this.ctx.getWebSockets()) {
      if (exclude && other === exclude) continue
      if (other.readyState !== WebSocket.OPEN && other.readyState !== WebSocket.CONNECTING) continue
      const tag = other.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle === handle) return true
    }
    return false
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
        isGuest: p.isGuest
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

  // ---------- Chat-presence write-through (fired via waitUntil) -------------
  //
  // The previous implementation used a 5s setTimeout debounce, but in-memory
  // timers don't survive DO hibernation. Now invoked directly from the
  // status:set branch via ctx.waitUntil(), which keeps the fetch alive past
  // the handler return without depending on isolate longevity.

  private async syncStatus(handle: ActorHandle, status: OfficeStatus): Promise<void> {
    const env = this.env
    if (!env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return

    const [type, id] = handle.split(':') as ['user' | 'client', string]
    try {
      await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/sync-status`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-office-sync-secret': env.OFFICE_SYNC_SECRET
        },
        body: JSON.stringify({ actor_type: type, actor_id: id, status })
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
