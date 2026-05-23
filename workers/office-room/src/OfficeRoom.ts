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
import {
  applyKnockAccept,
  applyKnockCancel,
  applyKnockDeny,
  applyKnockRequest,
  applyKnockTimeout,
  applyStatusSet,
  applyZoneEnter,
  applyZoneLeave,
  type KnockState,
} from './handlers'
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

  // ---------- Knock state (Phase 1c.1) --------------------------------------
  // Knocks expire after 30s. Timer is in-memory setTimeout — DO hibernation
  // would silently drop the timer; per spec, that's acceptable (knockee just
  // stops getting the incoming UI, knocker sees an indefinite pending until
  // either party cancels or the hibernation wakes for another reason).
  private readonly KNOCK_TTL_MS = 30_000
  private knockState: KnockState = { byId: new Map(), acceptedByZone: new Map() }
  private knockTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  /** zoneId → knocker handle currently allowed to bypass the capacity check */
  private acceptedKnockerHandlesByZone: Map<string, ActorHandle> = new Map()
  /** Stable per-WS string id (WebSocket has no built-in identity we can use as Map key) */
  private wsIdMap: WeakMap<WebSocket, string> = new WeakMap()
  private wsIdCounter = 0

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
            // Phase 1c.1: an accepted knocker may bypass capacity for this one entry.
            // Slot is released after the enter completes (below).
            if (!this.isAcceptedKnockerFor(p.handle, msg.zoneId)) {
              this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'capacity' as ZoneJoinFailReason, message: 'Room is full' })
              return
            }
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
        // Phase 1c.1: leaving releases any accepted-knock slot we held in the zone.
        this.cleanupKnocksForHandle(handle)
        const { broadcast } = applyZoneLeave(p, now)
        this.broadcast(broadcast)
        await this.scheduleNextAlarm()
        return
      }

      // -------- Phase 1c.1: Knock dispatch --------------------------------

      case 'knock:request': {
        const targetZoneId = msg.targetZoneId
        const meta = await this.loadZoneMeta()
        const zoneMeta = meta?.get(targetZoneId)
        // Reject path 1: zone unknown or not focus-type (only focus zones are knockable)
        if (!zoneMeta || zoneMeta.cfPresetDefault !== 'audio_only_publish') {
          this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'not-knockable' })
          return
        }
        // Reject path 2: knocker already in the target zone (self-knock)
        if (p.currentZoneId === targetZoneId) {
          this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'self-knock' })
          return
        }
        // Reject path 3: zone has an active accepted-knock in progress
        if (this.knockState.acceptedByZone.has(targetZoneId)) {
          this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'busy' })
          return
        }
        // Find an occupant of the target zone (any will do; if multiple we
        // pick the first; the knockee's other-tab open WS all get notified
        // because we dispatch by handle, not by ws id).
        let knockeeHandle: ActorHandle | null = null
        for (const candidate of this.participants.values()) {
          if (candidate.currentZoneId === targetZoneId && candidate.disconnectedAt === null) {
            knockeeHandle = candidate.handle
            break
          }
        }
        if (!knockeeHandle) {
          this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'no-occupant' })
          return
        }
        const knockeeSockets = this.socketsForHandle(knockeeHandle)
        if (knockeeSockets.length === 0) {
          this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'no-occupant' })
          return
        }
        // Reserve a knockId. The handler stores entry, and we dispatch to all
        // knockee tabs; the wsId we record is the first tab's (used only for
        // the "find the WS" path on cancel/timeout — accept/deny can come
        // from any tab and we resolve by knockId, not by ws).
        const knockId = crypto.randomUUID()
        const result = applyKnockRequest({
          state: this.knockState,
          knockId,
          knockerHandle: p.handle,
          knockerName: p.name,
          knockerWsId: this.wsId(ws),
          knockeeHandle,
          knockeeWsId: this.wsId(knockeeSockets[0]!),
          zoneId: targetZoneId,
          now,
          ttlMs: this.KNOCK_TTL_MS,
        })
        if (result.kind !== 'ok') {
          // Duplicate knockId (vanishingly unlikely with uuid). Surface as not-knockable.
          this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'not-knockable' })
          return
        }
        // Dispatch knock:incoming to every tab of the knockee
        this.sendToHandle(knockeeHandle, result.toKnockee)
        // 30s timeout — DO hibernation may drop this, accepted per spec.
        const timer = setTimeout(() => this.fireKnockTimeout(knockId), this.KNOCK_TTL_MS)
        this.knockTimeouts.set(knockId, timer)
        return
      }

      case 'knock:accept': {
        const knockId = msg.knockId
        this.clearKnockTimeout(knockId)
        const result = applyKnockAccept({ state: this.knockState, knockId })
        if (result.kind !== 'ok') {
          // Race: already accepted/denied/cancelled/timed out. Nothing to do.
          return
        }
        // Verify knockee is still in the target zone — if they left, the
        // knock no longer makes sense. Release the busy slot and notify
        // the knocker that the room is empty.
        const knockee = this.participants.get(result.knockeeHandle as ActorHandle)
        if (!knockee || knockee.currentZoneId !== result.zoneId || knockee.disconnectedAt !== null) {
          this.knockState.acceptedByZone.delete(result.zoneId)
          const knockerWs = this.findWsByWsId(result.knockerWsId)
          if (knockerWs) {
            this.sendTo(knockerWs, { type: 'knock:result', knockId: knockId as any, status: 'no-occupant' })
          }
          return
        }
        // Mint a media token for the knocker against the zone's CF meeting.
        // Ensure the meeting exists first.
        const meta = await this.loadZoneMeta()
        const zoneMeta = meta?.get(result.zoneId)
        if (!zoneMeta) {
          this.knockState.acceptedByZone.delete(result.zoneId)
          const knockerWs = this.findWsByWsId(result.knockerWsId)
          if (knockerWs) {
            this.sendTo(knockerWs, { type: 'knock:result', knockId: knockId as any, status: 'not-knockable' })
          }
          return
        }
        let cfMeetingId = zoneMeta.cfMeetingId
        if (!cfMeetingId) {
          try {
            const created = await createZoneMeeting({ env: this.env, title: `Zone ${result.zoneId}` })
            cfMeetingId = created.meetingId
            this.zoneMeta!.set(result.zoneId, { ...zoneMeta, cfMeetingId })
            this.ctx.waitUntil(this.persistMeetingId(result.zoneId, cfMeetingId))
          } catch {
            this.knockState.acceptedByZone.delete(result.zoneId)
            const knockerWs = this.findWsByWsId(result.knockerWsId)
            if (knockerWs) {
              this.sendTo(knockerWs, { type: 'knock:result', knockId: knockId as any, status: 'no-occupant' })
            }
            return
          }
        }
        // Knock-accepted knockers always get audio_only_publish (focus-zone
        // knock semantics — they're joining a focus room).
        const presetName = 'audio_only_publish' as ZonePresetName
        let mint: { participantId: string, authToken: string }
        try {
          // Find the knocker participant by handle to use their display name.
          const knocker = this.participants.get(result.knockerHandle as ActorHandle)
          if (!knocker) {
            this.knockState.acceptedByZone.delete(result.zoneId)
            return
          }
          mint = await mintZoneToken({
            env: this.env,
            meetingId: cfMeetingId,
            handle: result.knockerHandle as ActorHandle,
            name: result.knockerName,
            presetName,
          })
        } catch {
          this.knockState.acceptedByZone.delete(result.zoneId)
          const knockerWs = this.findWsByWsId(result.knockerWsId)
          if (knockerWs) {
            this.sendTo(knockerWs, { type: 'knock:result', knockId: knockId as any, status: 'no-occupant' })
          }
          return
        }
        const expiresAt = Date.now() + this.TOKEN_TTL_MS
        const media: MediaCredentials = {
          authToken: mint.authToken,
          meetingId: cfMeetingId,
          participantId: mint.participantId,
          presetName,
          expiresAt,
        }
        // Reserve the knocker's capacity-bypass slot so their forthcoming
        // zone:enter can succeed even when the room is at capacity.
        this.acceptedKnockerHandlesByZone.set(result.zoneId, result.knockerHandle as ActorHandle)
        const knockerWs = this.findWsByWsId(result.knockerWsId)
        if (knockerWs) {
          this.sendTo(knockerWs, {
            type: 'knock:result',
            knockId: knockId as any,
            status: 'accepted',
            media,
          })
        }
        return
      }

      case 'knock:deny': {
        const knockId = msg.knockId
        this.clearKnockTimeout(knockId)
        const result = applyKnockDeny({ state: this.knockState, knockId })
        if (result.kind !== 'ok') return  // race; nothing to do
        const knockerWs = this.findWsByWsId(result.knockerWsId)
        if (knockerWs) this.sendTo(knockerWs, result.toKnocker)
        return
      }

      case 'knock:cancel': {
        const knockId = msg.knockId
        const result = applyKnockCancel({
          state: this.knockState,
          knockId,
          cancellerWsId: this.wsId(ws),
        })
        if (result.kind !== 'ok') return  // not the canceller, or already resolved
        this.clearKnockTimeout(knockId)
        // Spec: no dispatch — knocker already knows since they sent it.
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
    // Phase 1c.1: if THIS ws had any pending knocks (knocker or knockee), tear
    // them down regardless of whether other tabs are still open — the specific
    // tab's UI is gone. Pass the closing-ws id so we only touch entries that
    // reference it, leaving multi-tab knocks on other tabs intact.
    if (closingWs) {
      const closingWsId = this.wsIdMap.get(closingWs)
      if (closingWsId) {
        // Only tear down knocks that specifically reference the closing ws.
        // If the participant has other tabs open, the actor-level state
        // (acceptedKnockerHandlesByZone) stays intact and is released only
        // when they actually leave the zone or fully disconnect.
        for (const [knockId, entry] of this.knockState.byId) {
          if (entry.knockerWsId !== closingWsId && entry.knockeeWsId !== closingWsId) continue
          this.clearKnockTimeout(knockId)
          this.knockState.byId.delete(knockId)
          if (entry.knockeeWsId === closingWsId) {
            const knockerWs = this.findWsByWsId(entry.knockerWsId)
            if (knockerWs) {
              this.sendTo(knockerWs, { type: 'knock:result', knockId: knockId as any, status: 'no-occupant' })
            }
          }
        }
      }
    }
    if (this.hasOtherActiveSocket(handle, closingWs)) return
    p.disconnectedAt = Date.now()
    // Phase 1c.1: full disconnect (no other tabs) — release any zone-bypass
    // slots and pending knocks that reference this handle.
    this.cleanupKnocksForHandle(handle)
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
    // Phase 1c.1: defensive cleanup — should already have happened on
    // handleDisconnect, but if a participant was force-evicted while still
    // holding a knock-bypass slot, release it now.
    this.cleanupKnocksForHandle(handle)
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

  // ---------- Knock helpers (Phase 1c.1) --------------------------------------

  /** Lazy-assign a stable per-WS string id (used as knockerWsId / knockeeWsId). */
  private wsId(ws: WebSocket): string {
    let id = this.wsIdMap.get(ws)
    if (!id) {
      id = `ws-${++this.wsIdCounter}`
      this.wsIdMap.set(ws, id)
    }
    return id
  }

  /** Find all currently-open WS belonging to a given handle (multi-tab). */
  private socketsForHandle(handle: ActorHandle): WebSocket[] {
    const out: WebSocket[] = []
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle === handle) out.push(ws)
    }
    return out
  }

  /** Send a message to every WS belonging to a handle (no-op if none). */
  private sendToHandle(handle: ActorHandle, msg: OutboundMessage): void {
    for (const ws of this.socketsForHandle(handle)) this.sendTo(ws, msg)
  }

  private clearKnockTimeout(knockId: string): void {
    const h = this.knockTimeouts.get(knockId)
    if (h) {
      clearTimeout(h)
      this.knockTimeouts.delete(knockId)
    }
  }

  private fireKnockTimeout(knockId: string): void {
    this.knockTimeouts.delete(knockId)
    const result = applyKnockTimeout({ state: this.knockState, knockId })
    if (result.kind !== 'ok') return  // race: accept/deny/cancel beat us
    // Find the knocker via the entry's knockerHandle — wsId may have closed.
    // applyKnockTimeout consumed the entry; we need the handle from before.
    // The result only returns knockerWsId; we can find a live ws by id.
    const ws = this.findWsByWsId(result.knockerWsId)
    if (ws) this.sendTo(ws, result.toKnocker)
  }

  private findWsByWsId(wsIdStr: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.wsIdMap.get(ws) === wsIdStr) return ws
    }
    return null
  }

  private isAcceptedKnockerFor(handle: ActorHandle, zoneId: string): boolean {
    return this.acceptedKnockerHandlesByZone.get(zoneId) === handle
  }

  /** Clear any pending knocks and accepted-knock entries involving this handle. */
  private cleanupKnocksForHandle(handle: ActorHandle, disconnectedWsId?: string): void {
    // Release any accepted-knock zone slots where this handle was the accepted knocker
    for (const [zoneId, knockerHandle] of this.acceptedKnockerHandlesByZone) {
      if (knockerHandle === handle) {
        this.acceptedKnockerHandlesByZone.delete(zoneId)
        this.knockState.acceptedByZone.delete(zoneId)
      }
    }
    // Tear down any pending knocks involving this handle / ws
    for (const [knockId, entry] of this.knockState.byId) {
      const wsMatches = disconnectedWsId !== undefined && (entry.knockerWsId === disconnectedWsId || entry.knockeeWsId === disconnectedWsId)
      const handleMatches = entry.knockerHandle === handle || entry.knockeeHandle === handle
      if (!wsMatches && !handleMatches) continue
      this.clearKnockTimeout(knockId)
      this.knockState.byId.delete(knockId)
      // If the knockee is the one gone, inform the knocker so their pending UI clears.
      if (entry.knockeeHandle === handle || entry.knockeeWsId === disconnectedWsId) {
        const knockerWs = this.findWsByWsId(entry.knockerWsId)
        if (knockerWs) {
          this.sendTo(knockerWs, {
            type: 'knock:result',
            knockId: knockId as any,
            status: 'no-occupant',
          })
        }
      }
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
