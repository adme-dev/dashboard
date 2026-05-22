import type { ActorHandle, OfficeStatus, OfficeSnapshot } from '../../../app/types/office'

// =============================================================================
// Inbound WS messages (browser -> DO)
// =============================================================================

export type InboundMessage
  = | { type: 'heartbeat' }
    | { type: 'status:set', status: OfficeStatus }
    | { type: 'zone:enter', zoneId: string }
    | { type: 'zone:leave' }

// =============================================================================
// Outbound WS messages (DO -> browser)
// =============================================================================

export type OutboundMessage
  = | { type: 'snapshot', snapshot: OfficeSnapshot }
    | { type: 'participant:joined', handle: ActorHandle, name: string, avatarUrl: string | null, status: OfficeStatus, isGuest: boolean }
    | { type: 'participant:left', handle: ActorHandle }
    | { type: 'participant:updated', handle: ActorHandle, status: OfficeStatus }
    | { type: 'participant:moved', handle: ActorHandle, zoneId: string | null }
    | { type: 'zone:entered', zoneId: string }
    | { type: 'zone:denied', zoneId: string, reason: string }
    | { type: 'zone:full', zoneId: string }
    | { type: 'zone:taken-over' } // sent to older tab when newer tab takes the zone
    | { type: 'error', message: string }
