import { DurableObject } from 'cloudflare:workers'
import type {
  ActorHandle,
  OfficeMediaSession,
  OfficeMediaUnavailableReason,
  OfficeParticipant,
  OfficeRemoteTrackCapability,
  OfficeSnapshot,
  OfficeZoneAccessPolicy,
  OfficeZoneRow,
  ZoneType,
  OfficeStatus
} from '../../../app/types/office'
import type { InboundMessage, OutboundMessage } from './types'
import {
  applyPresenceEvent,
  applyParticipantEvict,
  applyStatusSet,
  applyZoneEnter,
  applyZoneLeave,
  applyZoneNotesUpdated,
  evaluateZoneCapacity,
  evaluateGuestBadgeIdentity,
  evaluateZoneEntry
} from './handlers'
import {
  createZoneRealtimeMediaSession,
  refreshZoneRealtimeMediaGrant,
  type RealtimeEnv
} from './realtime'
import { signOfficeRemoteTrackGrant } from './jwt'

interface Env extends RealtimeEnv {
  /** Base URL of the Pages app, e.g. https://agency-dashboard-6cm.pages.dev */
  SYNC_BASE_URL?: string
  /** Shared secret for the chat-presence sync endpoint */
  OFFICE_SYNC_SECRET?: string
}

interface ConnMeta {
  officeId: string
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: 'admin' | 'member' | 'guest'
  isGuest: boolean
  allowedZoneId: string | null
  guestBadgeId: string | null
  zoneCapacities: Record<string, number>
  zoneAccessPolicies: Record<string, OfficeZoneAccessPolicy>
  joinedAt: number
}

interface ParticipantState extends ConnMeta {
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
  disconnectedAt: number | null
  mediaSession: OfficeMediaSession | null
  publishedTracks: Array<{ trackName: string, kind: 'audio' | 'video' }>
}

interface ParticipantAttachment extends ConnMeta {
  status?: OfficeStatus
  currentZoneId?: string | null
  lastSeenAt?: number
  disconnectedAt?: number | null
  mediaSession?: OfficeMediaSession | null
  publishedTracks?: Array<{ trackName: string, kind: 'audio' | 'video' }>
}

const GRACE_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 60_000
const ZONE_TYPES = new Set<ZoneType>(['lobby', 'meeting', 'focus', 'theater', 'client_lounge', 'desk'])

function sanitizeZoneCapacities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const capacities: Record<string, number> = {}
  for (const [zoneId, capacity] of Object.entries(value)) {
    if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 1) continue
    capacities[zoneId] = Math.floor(capacity)
  }
  return capacities
}

function parseZoneCapacities(value: string | null): Record<string, number> {
  if (!value) return {}
  try {
    return sanitizeZoneCapacities(JSON.parse(value))
  } catch {
    return {}
  }
}

function sanitizeZoneAccessPolicies(value: unknown): Record<string, OfficeZoneAccessPolicy> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const policies: Record<string, OfficeZoneAccessPolicy> = {}
  for (const [zoneId, rawPolicy] of Object.entries(value)) {
    if (!zoneId || !rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) continue
    const policy = rawPolicy as Partial<OfficeZoneAccessPolicy>
    if (
      typeof policy.zone_type !== 'string'
      || !ZONE_TYPES.has(policy.zone_type as ZoneType)
      || typeof policy.is_private !== 'boolean'
    ) continue
    policies[zoneId] = {
      zone_type: policy.zone_type as ZoneType,
      is_private: policy.is_private,
      acl: policy.acl && typeof policy.acl === 'object' && !Array.isArray(policy.acl) ? policy.acl : {}
    }
  }
  return policies
}

function parseZoneAccessPolicies(value: string | null): Record<string, OfficeZoneAccessPolicy> {
  if (!value) return {}
  try {
    return sanitizeZoneAccessPolicies(JSON.parse(value))
  } catch {
    return {}
  }
}

function mediaUnavailableReason(error: unknown): OfficeMediaUnavailableReason {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('quota') || message.includes('429')) return 'quota'
  if (message.includes('realtime') || message.includes('fetch')) return 'realtime-unavailable'
  return 'unknown'
}

export class OfficeRoom extends DurableObject<Env> {
  // In-memory participant state keyed by ActorHandle
  private participants = new Map<ActorHandle, ParticipantState>()
  private zoneCapacities = new Map<string, number>()
  // Map from WS to its handle (so we can find the participant on close)
  private wsToHandle = new WeakMap<WebSocket, ActorHandle>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore handles AND participant identity from hibernation tags. Without
    // rehydrating `participants`, post-wakeup messages on existing WSs would
    // find no participant entry and silently drop status/zone changes.
    // Active zone and media state are also kept in the attachment so an
    // isolate wake-up cannot widen or silently lose the media boundary.
    const now = Date.now()
    for (const ws of ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as Partial<ParticipantAttachment> | undefined
      if (!tag?.handle) continue
      this.wsToHandle.set(ws, tag.handle)
      if (!this.participants.has(tag.handle)) {
        this.participants.set(tag.handle, {
          officeId: tag.officeId ?? '',
          handle: tag.handle,
          name: tag.name ?? 'Unknown',
          avatarUrl: tag.avatarUrl ?? null,
          role: tag.role ?? 'member',
          isGuest: tag.isGuest ?? false,
          allowedZoneId: tag.allowedZoneId ?? null,
          guestBadgeId: tag.guestBadgeId ?? null,
          zoneCapacities: sanitizeZoneCapacities(tag.zoneCapacities),
          zoneAccessPolicies: sanitizeZoneAccessPolicies(tag.zoneAccessPolicies),
          joinedAt: tag.joinedAt ?? now,
          status: tag.status ?? 'available',
          currentZoneId: tag.currentZoneId ?? null,
          lastSeenAt: tag.lastSeenAt ?? now,
          disconnectedAt: tag.disconnectedAt ?? null,
          mediaSession: tag.mediaSession ?? null,
          publishedTracks: this.sanitizePublishedTracks(tag.publishedTracks)
        })
        this.mergeZoneCapacities(sanitizeZoneCapacities(tag.zoneCapacities))
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return await this.handleControlRequest(request)
    }

    return this.handleWebSocketUpgrade(request)
  }

  private async handleControlRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST') {
      return new Response('Not found', { status: 404 })
    }

    const body = await request.json() as {
      zoneId?: unknown
      capacity?: unknown
      policy?: unknown
      zone?: unknown
    }
    if (typeof body.zoneId !== 'string' || !body.zoneId) {
      return new Response('zoneId required', { status: 400 })
    }

    if (url.pathname === '/admin/zone-deleted') {
      this.applyZoneDeleted(body.zoneId)
      return Response.json({ ok: true })
    }

    if (url.pathname === '/admin/zone-upserted') {
      const zone = this.sanitizeZoneRow(body.zone)
      if (!zone || zone.id !== body.zoneId) {
        return new Response('valid zone required', { status: 400 })
      }
      this.applyZoneUpserted(zone)
      return Response.json({ ok: true })
    }

    if (url.pathname !== '/admin/zone-policy') {
      return new Response('Not found', { status: 404 })
    }

    const policy = sanitizeZoneAccessPolicies({ [body.zoneId]: body.policy })[body.zoneId] ?? null
    this.applyZonePolicyUpdate({
      zoneId: body.zoneId,
      capacity: typeof body.capacity === 'number' ? body.capacity : null,
      policy
    })

    return Response.json({ ok: true })
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
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
    const allowedZoneId = url.searchParams.get('allowedZoneId') || null
    const guestBadgeId = url.searchParams.get('guestBadgeId') || null
    const zoneCapacities = parseZoneCapacities(url.searchParams.get('zoneCapacities'))
    const zoneAccessPolicies = parseZoneAccessPolicies(url.searchParams.get('zoneAccessPolicies'))

    if (!officeId || !handle || !name || !role) {
      return new Response('Missing required params', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

    this.ctx.acceptWebSocket(server)
    const meta: ConnMeta = {
      officeId,
      handle,
      name,
      avatarUrl,
      role,
      isGuest,
      allowedZoneId,
      guestBadgeId,
      zoneCapacities,
      zoneAccessPolicies,
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
      this.takeOverExistingSockets(meta.handle, ws)
      const wasDisconnected = existing.disconnectedAt !== null
      existing.disconnectedAt = null
      existing.lastSeenAt = Date.now()
      existing.name = meta.name
      existing.avatarUrl = meta.avatarUrl
      existing.role = meta.role
      existing.isGuest = meta.isGuest
      existing.allowedZoneId = meta.allowedZoneId
      existing.guestBadgeId = meta.guestBadgeId
      existing.zoneCapacities = meta.zoneCapacities
      existing.zoneAccessPolicies = meta.zoneAccessPolicies
      this.mergeZoneCapacities(meta.zoneCapacities)
      this.persistParticipant(existing)
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
      disconnectedAt: null,
      mediaSession: null,
      publishedTracks: []
    }
    this.participants.set(meta.handle, participant)
    this.mergeZoneCapacities(meta.zoneCapacities)
    this.ctx.waitUntil(this.syncLocation(meta.officeId, meta.handle, null, 'online'))

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

  private takeOverExistingSockets(handle: ActorHandle, currentWs: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === currentWs) continue
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle !== handle) continue
      this.sendTo(ws, { type: 'zone:taken-over' })
      try {
        ws.close(4000, 'session taken over')
      } catch {
        /* ignore */
      }
    }
  }

  private async handleMessage(
    handle: ActorHandle,
    ws: WebSocket,
    msg: InboundMessage
  ): Promise<void> {
    const p = this.participants.get(handle)
    if (!p) return
    p.lastSeenAt = Date.now()

    const guestAccess = await this.validateGuestBadge(p)
    if (!guestAccess.allowed) {
      this.sendTo(ws, { type: 'error', message: guestAccess.reason })
      this.removeParticipant(handle)
      try {
        ws.close(4003, guestAccess.reason)
      } catch {
        /* ignore */
      }
      return
    }

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
        const entry = evaluateZoneEntry(p, msg.zoneId, p.zoneAccessPolicies[msg.zoneId])
        if (!entry.allowed) {
          this.sendTo(ws, {
            type: 'zone:denied',
            zoneId: msg.zoneId,
            reason: entry.reason
          })
          return
        }
        const capacity = evaluateZoneCapacity(
          this.zoneCapacities.get(msg.zoneId),
          this.zoneOccupantCount(msg.zoneId, handle)
        )
        if (!capacity.allowed) {
          this.sendTo(ws, { type: 'zone:full', zoneId: msg.zoneId })
          return
        }
        // 1a: no media token, no ACL check yet (full ACL in 1b/1c).
        // The Nitro WS endpoint gates membership; the DO trusts the upgrade.
        const previousZoneId = p.currentZoneId
        const { send, broadcast } = applyZoneEnter(p, msg.zoneId, now)
        this.clearParticipantMedia(p)
        this.persistParticipant(p)
        this.sendTo(ws, send)
        this.broadcast(broadcast)
        if (previousZoneId) {
          await this.broadcastZoneMediaTracks(previousZoneId)
        }
        this.ctx.waitUntil(this.reserveZoneMediaSession(p, ws, msg.zoneId))
        this.ctx.waitUntil(this.syncLocation(p.officeId, handle, msg.zoneId, 'online'))
        return
      }
      case 'zone:leave': {
        const previousZoneId = p.currentZoneId
        const { broadcast } = applyZoneLeave(p, now)
        this.clearParticipantMedia(p)
        this.persistParticipant(p)
        this.broadcast(broadcast)
        if (previousZoneId) {
          await this.broadcastZoneMediaTracks(previousZoneId)
        }
        this.ctx.waitUntil(this.syncLocation(p.officeId, handle, null, 'online'))
        return
      }
      case 'participant:evict': {
        const target = this.participants.get(msg.handle)
        const targetSnapshot = target
          ? { handle: target.handle, name: target.name, zoneId: target.currentZoneId }
          : null
        const result = applyParticipantEvict(p, target, now)
        if (!result.allowed) {
          this.sendTo(ws, result.send)
          return
        }
        this.sendToHandle(msg.handle, result.send)
        const evictedZoneId = targetSnapshot?.zoneId ?? null
        if (target) {
          this.clearParticipantMedia(target)
          this.persistParticipant(target)
        }
        this.broadcast(result.broadcast)
        if (evictedZoneId) {
          await this.broadcastZoneMediaTracks(evictedZoneId)
        }
        this.ctx.waitUntil(this.syncLocation(p.officeId, msg.handle, null, 'online'))
        this.ctx.waitUntil(this.syncAuditEvent({
          officeId: p.officeId,
          actorHandle: p.handle,
          action: 'room.participant_evicted',
          targetType: 'office_zone',
          targetId: result.send.zoneId,
          metadata: {
            evicted_handle: targetSnapshot?.handle ?? msg.handle,
            evicted_name: targetSnapshot?.name ?? null,
            zone_id: targetSnapshot?.zoneId ?? result.send.zoneId
          }
        }))
        return
      }
      case 'media:tracks-published': {
        if (
          !p.currentZoneId
          || !p.mediaSession
          || msg.sessionId !== p.mediaSession.sessionId
        ) {
          this.sendTo(ws, { type: 'error', message: 'media session does not match the active zone' })
          return
        }
        p.publishedTracks = this.sanitizePublishedTracks(msg.tracks)
        this.persistParticipant(p)
        await this.broadcastZoneMediaTracks(p.currentZoneId)
        return
      }
      case 'media:grant-refresh': {
        if (
          !p.currentZoneId
          || !p.mediaSession
          || msg.sessionId !== p.mediaSession.sessionId
        ) {
          this.sendTo(ws, { type: 'error', message: 'media session does not match the active zone' })
          return
        }
        try {
          p.mediaSession = await refreshZoneRealtimeMediaGrant({
            env: this.env,
            officeId: p.officeId,
            zoneId: p.currentZoneId,
            handle: p.handle,
            isGuest: p.isGuest,
            guestBadgeId: p.guestBadgeId,
            media: p.mediaSession
          })
          this.persistParticipant(p)
          this.sendTo(ws, {
            type: 'zone:media-session',
            zoneId: p.currentZoneId,
            media: p.mediaSession
          })
          await this.broadcastZoneMediaTracks(p.currentZoneId)
        } catch (error) {
          const zoneId = p.currentZoneId
          this.clearParticipantMedia(p)
          this.persistParticipant(p)
          this.sendTo(ws, {
            type: 'zone:media-unavailable',
            zoneId,
            reason: mediaUnavailableReason(error),
            message: error instanceof Error ? error.message : 'Realtime media is unavailable.'
          })
          await this.broadcastZoneMediaTracks(zoneId)
        }
        return
      }
      case 'zone:notes-updated': {
        const result = applyZoneNotesUpdated(p, msg, now)
        if (result.allowed) this.broadcast(result.broadcast)
        else this.sendTo(ws, result.send)
        return
      }
      case 'presence:event': {
        const { broadcast } = applyPresenceEvent(p, msg.kind, msg.target, now)
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

  private mergeZoneCapacities(capacities: Record<string, number>): void {
    for (const [zoneId, capacity] of Object.entries(capacities)) {
      if (!zoneId || !Number.isFinite(capacity) || capacity < 1) continue
      this.zoneCapacities.set(zoneId, Math.floor(capacity))
    }
  }

  private applyZonePolicyUpdate(input: {
    zoneId: string
    capacity: number | null
    policy: OfficeZoneAccessPolicy | null
  }): void {
    if (input.capacity && Number.isFinite(input.capacity) && input.capacity > 0) {
      this.zoneCapacities.set(input.zoneId, Math.floor(input.capacity))
    }

    const now = Date.now()
    for (const p of this.participants.values()) {
      if (input.capacity && Number.isFinite(input.capacity) && input.capacity > 0) {
        p.zoneCapacities[input.zoneId] = Math.floor(input.capacity)
      }
      if (input.policy) {
        p.zoneAccessPolicies[input.zoneId] = input.policy
      } else {
        const { [input.zoneId]: _removedPolicy, ...remainingPolicies } = p.zoneAccessPolicies
        p.zoneAccessPolicies = remainingPolicies
      }

      if (p.currentZoneId !== input.zoneId) continue
      const entry = evaluateZoneEntry(p, input.zoneId, p.zoneAccessPolicies[input.zoneId])
      if (entry.allowed) continue

      p.currentZoneId = null
      this.clearParticipantMedia(p)
      this.persistParticipant(p)
      p.lastSeenAt = now
      this.sendToHandle(p.handle, {
        type: 'zone:access-revoked',
        zoneId: input.zoneId,
        reason: entry.reason
      })
      this.broadcast({ type: 'participant:moved', handle: p.handle, zoneId: null })
      this.ctx.waitUntil(this.syncLocation(p.officeId, p.handle, null, 'online'))
      this.ctx.waitUntil(this.broadcastZoneMediaTracks(input.zoneId))
    }
  }

  private applyZoneUpserted(zone: OfficeZoneRow): void {
    this.applyZonePolicyUpdate({
      zoneId: zone.id,
      capacity: zone.capacity,
      policy: {
        zone_type: zone.zone_type,
        is_private: zone.is_private,
        acl: zone.acl ?? {}
      }
    })
    this.broadcast({ type: 'zone:upserted', zone })
  }

  private applyZoneDeleted(zoneId: string): void {
    this.zoneCapacities.delete(zoneId)
    const now = Date.now()

    for (const p of this.participants.values()) {
      const { [zoneId]: _removedPolicy, ...remainingPolicies } = p.zoneAccessPolicies
      p.zoneAccessPolicies = remainingPolicies
      const { [zoneId]: _removedCapacity, ...remainingCapacities } = p.zoneCapacities
      p.zoneCapacities = remainingCapacities

      if (p.currentZoneId !== zoneId) continue
      p.currentZoneId = null
      this.clearParticipantMedia(p)
      this.persistParticipant(p)
      p.lastSeenAt = now
      this.broadcast({ type: 'participant:moved', handle: p.handle, zoneId: null })
      this.ctx.waitUntil(this.syncLocation(p.officeId, p.handle, null, 'online'))
      this.ctx.waitUntil(this.broadcastZoneMediaTracks(zoneId))
    }

    this.broadcast({
      type: 'zone:deleted',
      zoneId,
      reason: 'This room was removed by an office admin.'
    })
  }

  private sanitizeZoneRow(value: unknown): OfficeZoneRow | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const zone = value as Partial<OfficeZoneRow>
    if (
      typeof zone.id !== 'string'
      || typeof zone.office_id !== 'string'
      || typeof zone.slug !== 'string'
      || typeof zone.name !== 'string'
      || typeof zone.zone_type !== 'string'
      || !ZONE_TYPES.has(zone.zone_type as ZoneType)
      || typeof zone.capacity !== 'number'
      || !Number.isInteger(zone.capacity)
      || zone.capacity < 1
      || typeof zone.is_private !== 'boolean'
      || !zone.position
      || typeof zone.position !== 'object'
    ) return null

    const position = zone.position as Partial<OfficeZoneRow['position']>
    if (
      typeof position.x !== 'number'
      || typeof position.y !== 'number'
      || typeof position.w !== 'number'
      || typeof position.h !== 'number'
      || !Number.isFinite(position.x)
      || !Number.isFinite(position.y)
      || !Number.isFinite(position.w)
      || !Number.isFinite(position.h)
      || position.x < 0
      || position.y < 0
      || position.w <= 0
      || position.h <= 0
    ) return null

    return {
      id: zone.id,
      office_id: zone.office_id,
      slug: zone.slug,
      name: zone.name,
      zone_type: zone.zone_type as ZoneType,
      position: {
        x: position.x,
        y: position.y,
        w: position.w,
        h: position.h
      },
      capacity: zone.capacity,
      is_private: zone.is_private,
      acl: zone.acl && typeof zone.acl === 'object' && !Array.isArray(zone.acl) ? zone.acl : {},
      notes: typeof zone.notes === 'string' ? zone.notes : '',
      notes_version: typeof zone.notes_version === 'number' ? zone.notes_version : 0,
      notes_updated_at: typeof zone.notes_updated_at === 'string' ? zone.notes_updated_at : null,
      notes_updated_by: typeof zone.notes_updated_by === 'string' ? zone.notes_updated_by : null,
      created_at: typeof zone.created_at === 'string' ? zone.created_at : new Date(0).toISOString()
    }
  }

  private zoneOccupantCount(zoneId: string, enteringHandle: ActorHandle): number {
    const occupants = new Set<ActorHandle>()
    for (const [handle, participant] of this.participants) {
      if (handle === enteringHandle) continue
      if (participant.disconnectedAt !== null) continue
      if (participant.currentZoneId === zoneId) occupants.add(handle)
    }
    return occupants.size
  }

  private async reserveZoneMediaSession(
    participant: ParticipantState,
    ws: WebSocket,
    zoneId: string
  ): Promise<void> {
    if (
      !this.env.REALTIME_APP_ID
      || !this.env.REALTIME_APP_SECRET
      || !this.env.OFFICE_SYNC_SECRET
    ) {
      this.sendTo(ws, {
        type: 'zone:media-unavailable',
        zoneId,
        reason: 'not-configured',
        message: 'Realtime media is not configured for this worker.'
      })
      return
    }

    try {
      const media = await createZoneRealtimeMediaSession({
        env: this.env,
        officeId: participant.officeId,
        zoneId,
        handle: participant.handle,
        isGuest: participant.isGuest,
        guestBadgeId: participant.guestBadgeId
      })
      if (participant.currentZoneId !== zoneId) return
      participant.mediaSession = media
      participant.publishedTracks = []
      this.persistParticipant(participant)
      this.sendTo(ws, {
        type: 'zone:media-session',
        zoneId,
        media
      })
      await this.broadcastZoneMediaTracks(zoneId)
    } catch (error) {
      this.sendTo(ws, {
        type: 'zone:media-unavailable',
        zoneId,
        reason: mediaUnavailableReason(error),
        message: error instanceof Error ? error.message : 'Realtime media is unavailable.'
      })
    }
  }

  private removeParticipant(handle: ActorHandle): void {
    const participant = this.participants.get(handle)
    if (!participant || !this.participants.delete(handle)) return
    const previousZoneId = participant.currentZoneId
    this.broadcast({ type: 'participant:left', handle })
    this.ctx.waitUntil(this.syncLocation(participant.officeId, handle, null, 'offline'))
    if (previousZoneId) {
      this.ctx.waitUntil(this.broadcastZoneMediaTracks(previousZoneId))
    }
  }

  private sanitizePublishedTracks(
    value: unknown
  ): Array<{ trackName: string, kind: 'audio' | 'video' }> {
    if (!Array.isArray(value)) return []
    const tracks: Array<{ trackName: string, kind: 'audio' | 'video' }> = []
    const seen = new Set<string>()
    for (const item of value.slice(0, 16)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const track = item as { trackName?: unknown, kind?: unknown }
      if (
        typeof track.trackName !== 'string'
        || !track.trackName.trim()
        || track.trackName.length > 256
        || (track.kind !== 'audio' && track.kind !== 'video')
      ) continue
      const key = `${track.kind}:${track.trackName}`
      if (seen.has(key)) continue
      seen.add(key)
      tracks.push({ trackName: track.trackName, kind: track.kind })
    }
    return tracks
  }

  private clearParticipantMedia(participant: ParticipantState): void {
    participant.mediaSession = null
    participant.publishedTracks = []
  }

  private persistParticipant(participant: ParticipantState): void {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (attachment?.handle !== participant.handle) continue
      const hibernatingSocket = ws as WebSocket & {
        serializeAttachment?: (value: unknown) => void
      }
      hibernatingSocket.serializeAttachment?.({
        ...participant
      } satisfies ParticipantAttachment)
    }
  }

  private async broadcastZoneMediaTracks(zoneId: string): Promise<void> {
    if (!this.env.OFFICE_SYNC_SECRET) return
    const expiresAt = Date.now() + 4 * 60_000
    const catalog: OfficeRemoteTrackCapability[] = []
    for (const publisher of this.participants.values()) {
      if (
        publisher.disconnectedAt !== null
        || publisher.currentZoneId !== zoneId
        || !publisher.mediaSession
      ) continue
      for (const track of publisher.publishedTracks) {
        catalog.push({
          publisherHandle: publisher.handle,
          publisherSessionId: publisher.mediaSession.sessionId,
          trackName: track.trackName,
          kind: track.kind,
          expiresAt,
          capability: await signOfficeRemoteTrackGrant({
            purpose: 'office-remote-track',
            officeId: publisher.officeId,
            zoneId,
            publisherHandle: publisher.handle,
            publisherSessionId: publisher.mediaSession.sessionId,
            trackName: track.trackName,
            kind: track.kind,
            exp: Math.floor(expiresAt / 1000)
          }, this.env.OFFICE_SYNC_SECRET)
        })
      }
    }

    for (const subscriber of this.participants.values()) {
      if (subscriber.disconnectedAt !== null || subscriber.currentZoneId !== zoneId) continue
      this.sendToHandle(subscriber.handle, {
        type: 'zone:media-tracks',
        zoneId,
        tracks: catalog.filter(track => track.publisherHandle !== subscriber.handle)
      })
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
    return { officeId: this.ctx.id.toString(), participants, zoneOccupancy }
  }

  private sendTo(ws: WebSocket, msg: OutboundMessage): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* ignore */
    }
  }

  private sendToHandle(handle: ActorHandle, msg: OutboundMessage): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle !== handle) continue
      this.sendTo(ws, msg)
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

  private async syncLocation(
    officeId: string,
    handle: ActorHandle,
    zoneId: string | null,
    presence: 'online' | 'offline'
  ): Promise<void> {
    const env = this.env
    if (!officeId || !env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return

    const [type, id] = handle.split(':') as ['user' | 'client', string]
    try {
      await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/sync-location`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-office-sync-secret': env.OFFICE_SYNC_SECRET
        },
        body: JSON.stringify({
          office_id: officeId,
          actor_type: type,
          actor_id: id,
          zone_id: zoneId,
          presence
        })
      })
    } catch {
      /* best-effort; live server-side occupancy can recover on next move */
    }
  }

  private async syncAuditEvent(input: {
    officeId: string
    actorHandle: ActorHandle
    action: string
    targetType: string
    targetId: string | null
    metadata: Record<string, unknown>
  }): Promise<void> {
    const env = this.env
    if (!input.officeId || !env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return

    const [actorType, actorId] = input.actorHandle.split(':') as ['user' | 'client', string]
    try {
      await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/audit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-office-sync-secret': env.OFFICE_SYNC_SECRET
        },
        body: JSON.stringify({
          office_id: input.officeId,
          actor_id: actorType === 'user' ? actorId : null,
          action: input.action,
          target_type: input.targetType,
          target_id: input.targetId,
          metadata: input.metadata
        })
      })
    } catch {
      /* best-effort; live room audit should not block room controls */
    }
  }

  private async validateGuestBadge(
    participant: ParticipantState
  ): Promise<{ allowed: true } | { allowed: false, reason: string }> {
    const identity = evaluateGuestBadgeIdentity(participant)
    if (!identity.allowed) {
      return identity
    }

    if (!participant.isGuest) {
      return { allowed: true }
    }

    const env = this.env
    if (!env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) {
      return { allowed: false, reason: 'guest badge validation is unavailable' }
    }

    try {
      const response = await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/guest-badge-status`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-office-sync-secret': env.OFFICE_SYNC_SECRET
        },
        body: JSON.stringify({
          office_id: participant.officeId,
          badge_id: participant.guestBadgeId,
          allowed_zone_id: participant.allowedZoneId
        })
      })
      if (!response.ok) {
        return { allowed: false, reason: 'guest badge is no longer active' }
      }
      const result = await response.json() as { active?: boolean, reason?: string }
      return result.active
        ? { allowed: true }
        : { allowed: false, reason: result.reason || 'guest badge is no longer active' }
    } catch {
      return { allowed: false, reason: 'guest badge validation failed' }
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
