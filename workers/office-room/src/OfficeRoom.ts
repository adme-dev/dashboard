import { DurableObject } from 'cloudflare:workers'
import type {
  ActorHandle,
  MediaCredentials,
  OfficeParticipant,
  OfficeSnapshot,
  OfficeStatus,
  ZoneJoinFailReason,
  ZonePresetName,
} from '../../../app/types/office'
import type { InboundMessage, OutboundMessage } from './types'
import { applyStatusSet, applyZoneEnter, applyZoneLeave } from './handlers'
import { createZoneMeeting, mintZoneToken, refreshZoneToken } from './realtime'

interface Env {
  /** Base URL of the Pages app, e.g. https://agency-dashboard-6cm.pages.dev */
  SYNC_BASE_URL?: string
  /** Shared secret for the chat-presence sync endpoint */
  OFFICE_SYNC_SECRET?: string
  /** Cloudflare account ID (for RealtimeKit) */
  CF_ACCOUNT_ID?: string
  /** RealtimeKit app ID */
  CF_REALTIMEKIT_APP_ID?: string
  /** RealtimeKit API token */
  CF_REALTIMEKIT_API_TOKEN?: string
}

interface ConnMeta {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: 'admin' | 'member' | 'guest'
  isGuest: boolean
  joinedAt: number
}

/** Media state persisted in the WS attachment to survive DO hibernation. */
interface MediaAttachment {
  currentZoneId: string | null
  cfMeetingId: string | null
  cfParticipantId: string | null
  presetName: ZonePresetName | null
  tokenExpiresAt: number | null
}

interface ParticipantState extends ConnMeta {
  status: OfficeStatus
  currentZoneId: string | null
  cfParticipantId: string | null
  /** Which CF meeting the current token is scoped to. */
  cfMeetingId: string | null
  /** Preset used at mint — preserved across refresh to prevent preset-flip. */
  presetName: ZonePresetName | null
  /** ms epoch of token expiry; refresh fires at expiresAt - REFRESH_LEAD_MS. */
  tokenExpiresAt: number | null
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

  // Lazy-populated zone metadata cache (capacity + CF meeting id per zone)
  private zoneMeta: Map<string, { capacity: number, cfMeetingId: string | null, cfPresetDefault: string }> | null = null

  // Per-zone async mutex to serialise zone:enter critical sections (Bug 2)
  private zoneEnterLocks = new Map<string, Promise<unknown>>()

  // Original officeId (UUID) used to construct this DO via idFromName. Must
  // be captured from the WS handshake — ctx.id.toString() returns the hashed
  // DO id, not the office UUID. Persisted to storage so it survives DO
  // hibernation. Without this, loadZoneMeta cannot query office_zones.
  private officeId: string | null = null

  // Token TTL that mirrors the CF default (1 hour)
  private readonly TOKEN_TTL_MS = 60 * 60_000
  // Fire refresh this many ms before expiry
  private readonly REFRESH_LEAD_MS = 5 * 60_000

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore handles AND participant identity from hibernation tags. Without
    // rehydrating `participants`, post-wakeup messages on existing WSs would
    // find no participant entry and silently drop status/zone changes.
    //
    // Media state (cfMeetingId, cfParticipantId, presetName, tokenExpiresAt,
    // currentZoneId) is also restored from attachments — this is what allows
    // alarm-based token refresh to survive hibernation (Bug 1 / Bug 4).
    //
    // Also restore officeId from storage (set on first WS handshake). Without
    // this, zone metadata lookups fail after hibernation.
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<string>('officeId')
      if (stored) this.officeId = stored
    })
    const now = Date.now()
    for (const ws of ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as Partial<ConnMeta & MediaAttachment> | undefined
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
          // Restore media state from attachment (Bug 1 / Bug 4 fix)
          currentZoneId: tag.currentZoneId ?? null,
          cfParticipantId: tag.cfParticipantId ?? null,
          cfMeetingId: tag.cfMeetingId ?? null,
          presetName: tag.presetName ?? null,
          tokenExpiresAt: tag.tokenExpiresAt ?? null,
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
    const officeId = url.searchParams.get('officeId')
    const handle = url.searchParams.get('handle') as ActorHandle | null
    const name = url.searchParams.get('name')
    const avatarUrl = url.searchParams.get('avatarUrl')
    const role = url.searchParams.get('role') as 'admin' | 'member' | 'guest' | null
    const isGuest = url.searchParams.get('isGuest') === 'true'

    if (!handle || !name || !role || !officeId) {
      return new Response('Missing required params', { status: 400 })
    }

    // Capture officeId on first handshake and persist for hibernation recovery.
    // ctx.id.toString() returns a hash, not the office UUID — we need the
    // original to query office_zones in loadZoneMeta.
    if (!this.officeId) {
      this.officeId = officeId
      await this.ctx.storage.put('officeId', officeId)
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
    // Persist full identity + empty media state in the attachment so the
    // participants Map can be rebuilt verbatim after DO hibernation.
    server.serializeAttachment({
      ...meta,
      currentZoneId: null,
      cfMeetingId: null,
      cfParticipantId: null,
      presetName: null,
      tokenExpiresAt: null,
    } satisfies ConnMeta & MediaAttachment)
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
    const now = Date.now()

    // Grace + heartbeat cleanup
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

    // Token refresh: fire for any connected participant whose token is within
    // REFRESH_LEAD_MS of expiry (Bug 1 fix — alarm-based, survives hibernation)
    for (const [handle, p] of this.participants) {
      if (!p.tokenExpiresAt || !p.cfMeetingId || !p.cfParticipantId) continue
      if (p.disconnectedAt !== null) continue  // skip disconnected (Bug 4 fix)
      if (now >= p.tokenExpiresAt - this.REFRESH_LEAD_MS) {
        await this.refreshTokenForParticipant(handle, p)
      }
    }

    await this.scheduleNextAlarm()
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
      cfParticipantId: null,
      cfMeetingId: null,
      presetName: null,
      tokenExpiresAt: null,
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
        // message handler returns before fetch settles.
        this.ctx.waitUntil(this.syncStatus(handle, msg.status))
        return
      }
      case 'zone:enter': {
        // Bug 2 fix: serialise the critical section per zone to prevent two
        // concurrent enters from both passing the cfMeetingId === null check and
        // each creating a separate CF meeting.
        await this.withZoneEnterLock(msg.zoneId, async () => {
          const meta = await this.loadZoneMeta()
          const zoneMeta = meta?.get(msg.zoneId)
          // If we don't know the zone, fail soft rather than minting blindly
          if (!zoneMeta) {
            this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'realtime-unavailable' as ZoneJoinFailReason, message: 'Zone metadata not loaded' })
            return
          }
          if (this.zoneOccupancyCount(msg.zoneId) >= zoneMeta.capacity) {
            this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'capacity' as ZoneJoinFailReason, message: 'Room is full' })
            return
          }
          // Resolve preset: server enforces — client's preferredPreset is honored only when it's 'viewer_lurking'
          const presetName: ZonePresetName = msg.preferredPreset === 'viewer_lurking'
            ? 'viewer_lurking'
            : (zoneMeta.cfPresetDefault as ZonePresetName) || 'staff_full'

          // Ensure meeting exists
          let cfMeetingId = zoneMeta.cfMeetingId
          if (!cfMeetingId) {
            try {
              const result = await createZoneMeeting({
                env: this.env,
                title: `Zone ${msg.zoneId}`,
              })
              cfMeetingId = result.meetingId
              this.zoneMeta!.set(msg.zoneId, { ...zoneMeta, cfMeetingId })
              // Best-effort persist; doesn't block the join
              this.ctx.waitUntil(this.persistMeetingId(msg.zoneId, cfMeetingId))
            } catch (err) {
              this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'meeting-create-failed' as ZoneJoinFailReason, message: (err as Error).message })
              return
            }
          }

          // Mint participant token
          let mint: { participantId: string, authToken: string }
          try {
            mint = await mintZoneToken({
              env: this.env,
              meetingId: cfMeetingId,
              handle,
              name: p.name,
              presetName,
            })
          } catch (err) {
            this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'mint-failed' as ZoneJoinFailReason, message: (err as Error).message })
            return
          }

          // Bug 1 + Bug 3 fix: track cfMeetingId and presetName per participant
          p.cfParticipantId = mint.participantId
          p.cfMeetingId = cfMeetingId
          p.presetName = presetName  // preserved on refresh — prevents preset-flip
          p.tokenExpiresAt = Date.now() + this.TOKEN_TTL_MS
          const mediaCredentials: MediaCredentials = {
            authToken: mint.authToken,
            meetingId: cfMeetingId,
            participantId: mint.participantId,
            presetName,
            expiresAt: p.tokenExpiresAt,
          }
          const { send, broadcast } = applyZoneEnter(p, msg.zoneId, mediaCredentials, now)
          this.sendTo(ws, send)
          this.broadcast(broadcast)
          // Persist media state to attachment for hibernation survival (Bug 1)
          this.persistMediaStateToAttachments(handle)
        })
        // Schedule (or re-schedule) the DO alarm after the lock resolves
        await this.scheduleNextAlarm()
        return
      }
      case 'zone:leave': {
        p.cfParticipantId = null
        p.cfMeetingId = null
        p.presetName = null
        p.tokenExpiresAt = null
        this.persistMediaStateToAttachments(handle)
        const { broadcast } = applyZoneLeave(p, now)
        this.broadcast(broadcast)
        await this.scheduleNextAlarm()
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
    // Bug 4 fix: use scheduleNextAlarm() so both grace AND refresh slots are
    // computed together — no separate setAlarm call that could clobber a pending
    // refresh scheduled earlier.
    await this.scheduleNextAlarm()
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
    // Re-evaluate alarm — that participant's refresh and grace slots are gone
    void this.ctx.waitUntil(this.scheduleNextAlarm())
  }

  // ---------- Zone metadata helpers ------------------------------------------

  private async loadZoneMeta(): Promise<Map<string, { capacity: number, cfMeetingId: string | null, cfPresetDefault: string }> | null> {
    if (this.zoneMeta) return this.zoneMeta
    const env = this.env
    if (!env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return null
    if (!this.officeId) return null  // first WS hasn't arrived yet
    try {
      const officeId = this.officeId
      const res = await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/zones?officeId=${encodeURIComponent(officeId)}`, {
        headers: { 'x-office-sync-secret': env.OFFICE_SYNC_SECRET },
      })
      if (!res.ok) return null
      const { zones } = (await res.json()) as { zones: { id: string, capacity: number, cf_meeting_id: string | null, cf_preset_default: string }[] }
      const m = new Map(zones.map(z => [z.id, { capacity: z.capacity, cfMeetingId: z.cf_meeting_id, cfPresetDefault: z.cf_preset_default }]))
      this.zoneMeta = m
      return m
    } catch {
      return null
    }
  }

  private zoneOccupancyCount(zoneId: string): number {
    let n = 0
    for (const p of this.participants.values()) {
      if (p.currentZoneId === zoneId && p.disconnectedAt === null) n++
    }
    return n
  }

  private async persistMeetingId(zoneId: string, meetingId: string): Promise<void> {
    const env = this.env
    if (!env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return
    try {
      await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/meeting`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-office-sync-secret': env.OFFICE_SYNC_SECRET,
        },
        body: JSON.stringify({ zoneId, meetingId }),
      })
    } catch { /* best-effort */ }
  }

  // ---------- Token refresh (alarm-based — Bug 1 fix) -----------------------

  /**
   * Computes the minimum next wake time across all participants (grace expiry
   * and token refresh) and registers a single alarm. Replaces the old
   * per-participant setTimeout pattern which was silently lost on hibernation.
   */
  private async scheduleNextAlarm(): Promise<void> {
    let nextAt: number | null = null
    for (const p of this.participants.values()) {
      if (p.disconnectedAt !== null) {
        const at = p.disconnectedAt + GRACE_MS
        if (nextAt === null || at < nextAt) nextAt = at
      }
      if (
        p.tokenExpiresAt !== null &&
        p.cfMeetingId !== null &&
        p.cfParticipantId !== null &&
        p.disconnectedAt === null
      ) {
        // Floor at now+1s to avoid scheduling alarms in the past (CF rejects those)
        const at = Math.max(Date.now() + 1_000, p.tokenExpiresAt - this.REFRESH_LEAD_MS)
        if (nextAt === null || at < nextAt) nextAt = at
      }
    }
    if (nextAt !== null) {
      await this.ctx.storage.setAlarm(nextAt)
    } else {
      await this.ctx.storage.deleteAlarm()
    }
  }

  /**
   * Refreshes the CF RealtimeKit token for a single participant.
   * Preserves the originally-minted presetName to fix the preset-flip bug (Bug 3).
   */
  private async refreshTokenForParticipant(handle: ActorHandle, p: ParticipantState): Promise<void> {
    if (!p.cfMeetingId || !p.cfParticipantId || !p.presetName || !p.currentZoneId) return
    try {
      const out = await refreshZoneToken({
        env: this.env,
        meetingId: p.cfMeetingId,
        participantId: p.cfParticipantId,
      })
      const expiresAt = Date.now() + this.TOKEN_TTL_MS
      p.tokenExpiresAt = expiresAt
      const media: MediaCredentials = {
        authToken: out.authToken,
        meetingId: p.cfMeetingId,
        participantId: p.cfParticipantId,
        presetName: p.presetName,  // Bug 3 fix: preserved — not re-read from zone default
        expiresAt,
      }
      const zoneId = p.currentZoneId
      for (const ws of this.ctx.getWebSockets()) {
        const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
        if (tag?.handle !== handle) continue
        try { ws.send(JSON.stringify({ type: 'zone:token-refreshed', zoneId, media } satisfies OutboundMessage)) } catch { /* ignore */ }
      }
      this.persistMediaStateToAttachments(handle)
    } catch {
      // Refresh failed — leave tokenExpiresAt alone; the next alarm tick will
      // retry, or the SDK will surface auth errors and the client will leave.
    }
  }

  // ---------- Attachment persistence helpers ---------------------------------

  /**
   * Writes current media state (cfMeetingId, cfParticipantId, presetName,
   * tokenExpiresAt, currentZoneId) into the WS attachment for all sockets
   * belonging to this handle. Called after every state change so that the DO
   * can rehydrate accurately after hibernation.
   */
  private persistMediaStateToAttachments(handle: ActorHandle): void {
    const p = this.participants.get(handle)
    if (!p) return
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as Partial<ConnMeta & MediaAttachment> | undefined
      if (tag?.handle !== handle) continue
      ws.serializeAttachment({
        handle: p.handle,
        name: p.name,
        avatarUrl: p.avatarUrl,
        role: p.role,
        isGuest: p.isGuest,
        joinedAt: p.joinedAt,
        // Media state — survives hibernation (Bug 1 fix)
        currentZoneId: p.currentZoneId,
        cfMeetingId: p.cfMeetingId,
        cfParticipantId: p.cfParticipantId,
        presetName: p.presetName,
        tokenExpiresAt: p.tokenExpiresAt,
      } satisfies ConnMeta & MediaAttachment)
    }
  }

  // ---------- Per-zone enter lock (Bug 2 fix) --------------------------------

  /**
   * Async mutex per zoneId. Serialises the capacity-check + meeting-create +
   * token-mint critical section so that two concurrent zone:enter messages on
   * an empty zone can't both observe cfMeetingId === null and each create a
   * separate CF meeting.
   */
  private async withZoneEnterLock<T>(zoneId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.zoneEnterLocks.get(zoneId) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(fn)
    this.zoneEnterLocks.set(zoneId, next)
    try {
      return await next
    } finally {
      if (this.zoneEnterLocks.get(zoneId) === next) {
        this.zoneEnterLocks.delete(zoneId)
      }
    }
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
    return { officeId: this.officeId ?? this.ctx.id.toString(), participants, zoneOccupancy }
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
