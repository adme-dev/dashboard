/**
 * Pure-function message handlers extracted from OfficeRoom for unit testing.
 * Each handler mutates the supplied participant in-place and returns the
 * outbound messages the caller should send/broadcast.
 */

import type { ActorHandle, MediaCredentials, OfficeStatus } from '../../../app/types/office'
import type { OutboundMessage } from './types'

export interface ParticipantLite {
  handle: ActorHandle
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
}

export function applyStatusSet(
  p: ParticipantLite,
  status: OfficeStatus,
  now: number
): { broadcast: OutboundMessage } {
  p.status = status
  p.lastSeenAt = now
  return { broadcast: { type: 'participant:updated', handle: p.handle, status } }
}

export function applyZoneEnter(
  p: ParticipantLite,
  zoneId: string,
  media: MediaCredentials,
  now: number,
): { send: OutboundMessage, broadcast: OutboundMessage } {
  p.currentZoneId = zoneId
  p.lastSeenAt = now
  return {
    send: { type: 'zone:joined', zoneId, media },
    broadcast: { type: 'participant:moved', handle: p.handle, zoneId }
  }
}

export function applyZoneLeave(
  p: ParticipantLite,
  now: number
): { broadcast: OutboundMessage } {
  p.currentZoneId = null
  p.lastSeenAt = now
  return {
    broadcast: { type: 'participant:moved', handle: p.handle, zoneId: null }
  }
}
