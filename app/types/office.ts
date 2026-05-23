// =============================================================================
// Virtual Office — shared types (front-end + server)
// =============================================================================

// Polymorphic actor handle. Wire format on all office WS messages.
// Format: 'user:<uuid>' or 'client:<uuid>'.
export type ActorHandle = `user:${string}` | `client:${string}`
export type ActorType = 'user' | 'client'

export interface ActorRef {
  type: ActorType
  id: string
  handle: ActorHandle
}

// Postgres row types (mirror migrations 097/098)

export type ZoneType = 'lobby' | 'meeting' | 'focus' | 'theater' | 'client_lounge'

export interface OfficeRow {
  id: string
  name: string
  layout: OfficeLayout
  created_at: string
  updated_at: string
}

export interface OfficeLayout {
  width?: number
  height?: number
  theme?: 'light' | 'dark'
  background?: string
}

export interface OfficeZoneRow {
  id: string
  office_id: string
  slug: string
  name: string
  zone_type: ZoneType
  position: ZonePosition
  capacity: number
  is_private: boolean
  acl: ZoneAcl
  notes: string
  notes_version: number
  notes_updated_at: string | null
  notes_updated_by: string | null
  created_at: string
}

export interface ZonePosition {
  x: number
  y: number
  w: number
  h: number
}

export interface ZoneAcl {
  allowed_roles?: string[]
  allowed_clients?: string[]
  public_lobby?: boolean
}

export type OfficeMemberRole = 'admin' | 'member' | 'guest'

export interface OfficeMemberRow {
  id: string
  office_id: string
  user_id: string | null
  client_user_id: string | null
  role: OfficeMemberRole
  added_at: string
}

// Presence state (live, in-DO, exposed to clients via snapshot)

export type OfficeStatus = 'available' | 'busy' | 'dnd' | 'away'

export interface OfficeParticipant {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: OfficeMemberRole
  status: OfficeStatus
  currentZoneId: string | null
  joinedAt: number // ms epoch
  isGuest: boolean // true if actorType='client'
}

export interface OfficeSnapshot {
  officeId: string
  participants: OfficeParticipant[]
  // Derived view, keyed by zoneId
  zoneOccupancy: Record<string, ActorHandle[]>
}

// =============================================================================
// Phase 1b — RealtimeKit media credentials
// =============================================================================

export type ZonePresetName = 'staff_full' | 'viewer_lurking'

// Returned to the joining browser on zone:joined / zone:token-refreshed. The
// browser passes `authToken` into RealtimeKitClient.init() and binds the
// resulting MediaStreamTracks to our OfficeMediaTile components.
export interface MediaCredentials {
  authToken: string
  meetingId: string
  participantId: string  // CF-side id; required for refresh
  presetName: ZonePresetName
  expiresAt: number  // ms epoch — best-effort estimate; refresh fires ~5min before
}

export type ZoneJoinFailReason
  = | 'capacity'
    | 'denied'
    | 'meeting-create-failed'
    | 'mint-failed'
    | 'quota'
    | 'realtime-unavailable'

// =============================================================================
// Phase 1c.1 — Knock pattern (audio-first + drop-in)
// =============================================================================

export type KnockId = string & { readonly __brand: 'KnockId' }

export type KnockResultStatus =
  | 'accepted'
  | 'denied'
  | 'timeout'
  | 'no-occupant'
  | 'busy'
  | 'not-knockable'
  | 'self-knock'

/** Client → server: knocker initiates a knock on a focus/private zone. */
export interface KnockRequestMessage {
  type: 'knock:request'
  targetZoneId: string
}

/** Server → knockee: knockee's client should open the accept/deny modal. */
export interface KnockIncomingMessage {
  type: 'knock:incoming'
  knockId: KnockId
  fromHandle: ActorHandle
  fromName: string
  zoneId: string
  /** ms remaining at message send time; client uses for countdown */
  ttlMs: number
}

/** Client → server: knockee accepts the knock. */
export interface KnockAcceptMessage {
  type: 'knock:accept'
  knockId: KnockId
}

/** Client → server: knockee denies the knock. */
export interface KnockDenyMessage {
  type: 'knock:deny'
  knockId: KnockId
}

/** Client → server: knocker cancels their pending knock before response. */
export interface KnockCancelMessage {
  type: 'knock:cancel'
  knockId: KnockId
}

/** Server → knocker: terminal result for an outbound knock. */
export interface KnockResultMessage {
  type: 'knock:result'
  knockId: KnockId
  status: KnockResultStatus
  /**
   * Present only when status === 'accepted'. Full MediaCredentials so the
   * client can call useOfficeRealtime.connect(creds) directly — same shape
   * used by zone:joined.
   */
  media?: MediaCredentials
}

/**
 * Server → knockee: the knock was abandoned by the knocker (they left the
 * office, closed their tab, or fully disconnected) before the knockee
 * responded. The knockee's accept/deny modal should close silently.
 *
 * No "cancelled" entry was added to KnockResultStatus because that union is
 * scoped to the knocker's outbound-knock result; the knockee's modal needs a
 * distinct close signal.
 */
export interface KnockCancelledMessage {
  type: 'knock:cancelled'
  knockId: KnockId
}
