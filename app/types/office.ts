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

export type ZoneType = 'lobby' | 'meeting' | 'focus' | 'theater' | 'client_lounge' | 'desk'

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

export interface OfficeZoneAccessPolicy {
  zone_type: ZoneType
  is_private: boolean
  acl: ZoneAcl
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

export interface OfficeSettingsRow {
  office_id: string
  guest_access_enabled: boolean
  public_lobbies_enabled: boolean
  recording_enabled: boolean
  public_recording_links_enabled: boolean
  ai_notes_enabled: boolean
  assistant_enabled: boolean
  default_meeting_retention_days: number
  default_recording_retention_days: number
  require_recording_consent: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface OfficeAuditEventRow {
  id: string
  office_id: string
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type OfficeLobbyRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired'
export type OfficeLobbyRequestSource = 'embed'

export interface OfficeLobbyRequestRow {
  id: string
  office_id: string
  lobby_id: string | null
  zone_id: string | null
  guest_name: string
  guest_email: string
  message: string
  scheduled_start_at: string | null
  status: OfficeLobbyRequestStatus
  notification_ids: string[]
  handled_by: string | null
  handled_at: string | null
  created_at: string
  updated_at: string
}

export type OfficeGuestBadgeStatus = 'active' | 'revoked' | 'expired'

export interface OfficeGuestBadgeRow {
  id: string
  office_id: string
  lobby_request_id: string | null
  guest_name: string
  guest_email: string
  allowed_zone_id: string | null
  status: OfficeGuestBadgeStatus
  expires_at: string
  created_by: string | null
  revoked_by: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface OfficeLobbyGuestRoomHandshake {
  token: string
  workerUrl: string
  exp: number
  guest: {
    name: string
    email: string
    badgeId: string | null
    accessExpiresAt: string | null
    source: OfficeLobbyRequestSource | null
    note?: string
    intakeAnswers?: Array<{
      label: string
      value: string
    }>
    prejoin: {
      micReady: boolean
      cameraOn: boolean
      notesApproved: boolean
      recordingApproved: boolean
    }
  }
  meeting: {
    id: string
    title: string | null
    scheduledStartAt: string | null
    durationMinutes: number | null
  } | null
  zone: {
    id: string
    slug: string | null
    name: string | null
  } | null
}

export type OfficeLobbyAvailabilityMode = 'manual' | 'office_presence' | 'scheduled'
export type OfficeLobbyBrandTexture = 'dots' | 'grid' | 'mesh' | 'none'

export interface OfficeLobbyShelfItem {
  label: string
  value: string
  url?: string
}

export interface OfficeLobbyAvailabilityWindow {
  days: number[]
  start: string
  end: string
  timezone?: string
}

export interface OfficeLobbyConfig {
  destination_zone_id?: string | null
  availability_mode?: OfficeLobbyAvailabilityMode
  event_duration_minutes?: number
  minimum_notice_minutes?: number
  daily_cap?: number
  intake_fields?: Array<{
    id: string
    label: string
    type: 'text' | 'email' | 'textarea' | 'select'
    required?: boolean
    options?: string[]
  }>
  brand?: {
    logo_url?: string
    background?: string
    texture?: OfficeLobbyBrandTexture
    verified?: boolean
  }
  shelf_items?: OfficeLobbyShelfItem[]
  availability_windows?: OfficeLobbyAvailabilityWindow[]
}

export interface OfficeLobbyRow {
  id: string
  office_id: string
  owner_user_id: string | null
  handle: string
  name: string
  description: string
  destination_zone_id: string | null
  is_active: boolean
  config: OfficeLobbyConfig
  created_at: string
  updated_at: string
}

export type OfficeMeetingSource = 'drop_in' | 'lobby' | 'scheduled'
export type OfficeMeetingStatus = 'planned' | 'live' | 'ended' | 'cancelled'
export type OfficeMeetingArtifactType = 'transcript' | 'summary' | 'recording' | 'action_items' | 'notes'

export interface OfficeMeetingSetup {
  meeting_type?: string
  context?: string
  scheduled_start_at?: string | null
  duration_minutes?: number | null
  intake_prompt?: string | null
}

export interface OfficeMeetingSessionRow {
  id: string
  office_id: string
  zone_id: string | null
  lobby_request_id: string | null
  lobby_id: string | null
  source: OfficeMeetingSource
  status: OfficeMeetingStatus
  title: string
  participant_handles: ActorHandle[]
  guest_emails: string[]
  consent: {
    ai_notes?: boolean
    recording?: boolean
    transcript?: boolean
    setup?: OfficeMeetingSetup
  }
  retention_days: number | null
  started_at: string | null
  ended_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OfficeMeetingArtifactRow {
  id: string
  meeting_session_id: string
  artifact_type: OfficeMeetingArtifactType
  title: string
  content: string
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
}

export type OfficeMeetingActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed'

export interface OfficeMeetingActionItemRow {
  id: string
  office_id: string
  meeting_session_id: string
  source_artifact_id: string | null
  line_index: number
  content: string
  status: OfficeMeetingActionItemStatus
  assignee_user_id: string | null
  task_id: string | null
  crm_task_id: string | null
  due_at: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export type OfficeRecordingStatus = 'draft' | 'processing' | 'ready' | 'failed' | 'archived'
export type OfficeRecordingAccess = 'private' | 'workspace' | 'public' | 'password'

export interface OfficeRecordingRow {
  id: string
  office_id: string
  meeting_session_id: string | null
  title: string
  description: string
  status: OfficeRecordingStatus
  access: OfficeRecordingAccess
  storage_key: string | null
  thumbnail_key: string | null
  duration_seconds: number | null
  transcript: string
  summary: string
  chapters: Array<{ title: string, start_seconds: number }>
  retention_days: number | null
  share_token: string | null
  password_hash: string | null
  view_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OfficeRecordingViewRow {
  id: string
  recording_id: string
  viewer_user_id: string | null
  viewer_email: string | null
  viewer_key: string | null
  percent_watched: number
  watched_seconds: number
  created_at: string
}

export type OfficeAssistantWatchType
  = | 'person_available'
    | 'room_occupied'
    | 'co_presence'
    | 'meeting_ended'
    | 'lobby_guest_waiting'

export type OfficeAssistantWatchStatus = 'active' | 'paused' | 'triggered' | 'cancelled'
export type OfficeAssistantJobType = 'notify' | 'schedule_meeting' | 'send_follow_up' | 'summarize_thread' | 'collect_status'
export type OfficeAssistantJobStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'

export interface OfficeAssistantWatchRow {
  id: string
  office_id: string
  user_id: string
  watch_type: OfficeAssistantWatchType
  status: OfficeAssistantWatchStatus
  label: string
  conditions: Record<string, unknown>
  delivery: {
    notification?: boolean
    chat?: boolean
    email?: boolean
  }
  last_triggered_at: string | null
  created_at: string
  updated_at: string
}

export interface OfficeAssistantJobRow {
  id: string
  office_id: string
  watch_id: string | null
  user_id: string | null
  job_type: OfficeAssistantJobType
  status: OfficeAssistantJobStatus
  title: string
  input: Record<string, unknown>
  result: Record<string, unknown>
  approval_required: boolean
  approved_by: string | null
  approved_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface OfficePresenceLocationRow {
  office_id: string
  actor_type: 'user' | 'client'
  actor_id: string
  handle: ActorHandle
  zone_id: string | null
  presence: 'online' | 'offline'
  last_seen_at: string
  updated_at: string
}

export interface OfficePresenceSummaryLocation extends OfficePresenceLocationRow {
  is_online: boolean
  display_name: string | null
  avatar_url: string | null
  zone_name: string | null
  zone_slug: string | null
  zone_type: ZoneType | null
}

export interface OfficePresenceSummary {
  locations: OfficePresenceSummaryLocation[]
  onlineCount: number
  zoneOccupancy: Record<string, ActorHandle[]>
}

export interface OfficeMediaSession {
  provider: 'cloudflare-realtime'
  sessionId: string
  correlationId: string
  createdAt: number
}

export type OfficeMediaUnavailableReason
  = | 'not-configured'
    | 'realtime-unavailable'
    | 'quota'
    | 'unknown'

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

export type OfficePresenceEventKind = 'knock' | 'wave' | 'raise_hand'

export type OfficePresenceEventTarget
  = | { type: 'zone', zoneId: string }
    | { type: 'actor', handle: ActorHandle, zoneId: string | null }

export interface OfficePresenceEvent {
  id: string
  kind: OfficePresenceEventKind
  from: ActorHandle
  target: OfficePresenceEventTarget
  createdAt: number
  expiresAt: number
}
