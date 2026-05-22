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
