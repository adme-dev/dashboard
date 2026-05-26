import type {
  ActorHandle,
  OfficeMediaSession,
  OfficeMediaUnavailableReason,
  OfficePresenceEvent,
  OfficePresenceEventKind,
  OfficePresenceEventTarget,
  OfficeStatus,
  OfficeSnapshot,
  OfficeZoneRow
} from '../../../app/types/office'

// =============================================================================
// Inbound WS messages (browser -> DO)
// =============================================================================

export type InboundMessage
  = | { type: 'heartbeat' }
    | { type: 'status:set', status: OfficeStatus }
    | { type: 'zone:enter', zoneId: string }
    | { type: 'zone:leave' }
    | { type: 'participant:evict', handle: ActorHandle }
    | { type: 'zone:notes-updated', zoneId: string, notes: string, version: number, updatedAt: string | null, updatedBy: string | null }
    | { type: 'presence:event', kind: OfficePresenceEventKind, target: OfficePresenceEventTarget }

// =============================================================================
// Outbound WS messages (DO -> browser)
// =============================================================================

export type OutboundMessage
  = | { type: 'snapshot', snapshot: OfficeSnapshot }
    | { type: 'participant:joined', handle: ActorHandle, name: string, avatarUrl: string | null, role: 'admin' | 'member' | 'guest', status: OfficeStatus, isGuest: boolean }
    | { type: 'participant:left', handle: ActorHandle }
    | { type: 'participant:updated', handle: ActorHandle, status: OfficeStatus }
    | { type: 'participant:moved', handle: ActorHandle, zoneId: string | null }
    | { type: 'zone:entered', zoneId: string }
    | { type: 'zone:denied', zoneId: string, reason: string }
    | { type: 'zone:full', zoneId: string }
    | { type: 'zone:media-session', zoneId: string, media: OfficeMediaSession }
    | { type: 'zone:media-unavailable', zoneId: string, reason: OfficeMediaUnavailableReason, message?: string }
    | { type: 'zone:notes-updated', zoneId: string, notes: string, version: number, updatedAt: string | null, updatedBy: string | null }
    | { type: 'zone:taken-over' } // sent to older tab when newer tab takes the zone
    | { type: 'zone:evicted', zoneId: string, by: ActorHandle }
    | { type: 'zone:access-revoked', zoneId: string, reason: string }
    | { type: 'zone:deleted', zoneId: string, reason: string }
    | { type: 'zone:upserted', zone: OfficeZoneRow }
    | { type: 'presence:event', event: OfficePresenceEvent }
    | { type: 'error', message: string }
