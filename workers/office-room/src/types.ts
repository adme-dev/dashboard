import type {
  ActorHandle,
  OfficeStatus,
  OfficeSnapshot,
  MediaCredentials,
  ZonePresetName,
  ZoneJoinFailReason,
  KnockResultStatus,
  KnockRequestMessage,
  KnockIncomingMessage,
  KnockAcceptMessage,
  KnockDenyMessage,
  KnockCancelMessage,
  KnockResultMessage,
} from '../../../app/types/office'

// =============================================================================
// Inbound WS messages (browser -> DO)
// =============================================================================

export type InboundMessage
  = | { type: 'heartbeat' }
    | { type: 'status:set', status: OfficeStatus }
    | { type: 'zone:enter', zoneId: string, preferredPreset?: ZonePresetName }
    | { type: 'zone:leave' }
    | KnockRequestMessage
    | KnockAcceptMessage
    | KnockDenyMessage
    | KnockCancelMessage

// =============================================================================
// Outbound WS messages (DO -> browser)
// =============================================================================

export type OutboundMessage
  = | { type: 'snapshot', snapshot: OfficeSnapshot }
    | { type: 'participant:joined', handle: ActorHandle, name: string, avatarUrl: string | null, role: 'admin' | 'member' | 'guest', status: OfficeStatus, isGuest: boolean }
    | { type: 'participant:left', handle: ActorHandle }
    | { type: 'participant:updated', handle: ActorHandle, status: OfficeStatus }
    | { type: 'participant:moved', handle: ActorHandle, zoneId: string | null }
    | { type: 'zone:joined', zoneId: string, media: MediaCredentials }
    | { type: 'zone:join-failed', zoneId: string, reason: ZoneJoinFailReason, message?: string }
    | { type: 'zone:token-refreshed', zoneId: string, media: MediaCredentials }
    | { type: 'zone:taken-over' } // sent to older tab when newer tab takes the zone
    | { type: 'error', message: string }
    | KnockIncomingMessage
    | KnockResultMessage
