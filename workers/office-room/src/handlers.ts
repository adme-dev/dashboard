/**
 * Pure-function message handlers extracted from OfficeRoom for unit testing.
 * Each handler mutates the supplied participant in-place and returns the
 * outbound messages the caller should send/broadcast.
 */

import type {
  ActorHandle,
  OfficeMemberRole,
  OfficeZoneAccessPolicy,
  OfficePresenceEventKind,
  OfficePresenceEventTarget,
  OfficeStatus
} from '../../../app/types/office'
import type { OutboundMessage } from './types'

const PRESENCE_EVENT_TTL_MS = 5_000

export interface ParticipantLite {
  handle: ActorHandle
  role?: 'admin' | 'member' | 'guest'
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
  isGuest?: boolean
  allowedZoneId?: string | null
  guestBadgeId?: string | null
}

export function evaluateGuestBadgeIdentity(
  p: Pick<ParticipantLite, 'isGuest' | 'guestBadgeId'>
): { allowed: true } | { allowed: false, reason: string } {
  if (!p.isGuest) {
    return { allowed: true }
  }

  if (!p.guestBadgeId) {
    return { allowed: false, reason: 'guest badge is required' }
  }

  return { allowed: true }
}

export function evaluateZoneEntry(
  p: Pick<ParticipantLite, 'isGuest' | 'allowedZoneId' | 'role'>,
  zoneId: string,
  policy?: OfficeZoneAccessPolicy | null
): { allowed: true } | { allowed: false, reason: string } {
  if (!p.isGuest) {
    if (!policy || !policy.is_private) return { allowed: true }
    if (p.role === 'admin') return { allowed: true }
    const allowedRoles = normalizeAllowedRoles(policy.acl?.allowed_roles)
    if (allowedRoles.length === 0) {
      return { allowed: false, reason: 'private zone admin-only' }
    }
    if (!p.role || !allowedRoles.includes(p.role)) {
      return { allowed: false, reason: `role ${p.role ?? 'unknown'} not in zone allow-list` }
    }
    return { allowed: true }
  }

  if (!p.allowedZoneId) {
    return { allowed: false, reason: 'guest room access requires an approved room' }
  }

  if (zoneId !== p.allowedZoneId) {
    return { allowed: false, reason: 'guest room access is limited to the approved room' }
  }

  return { allowed: true }
}

function normalizeAllowedRoles(roles: unknown): OfficeMemberRole[] {
  if (!Array.isArray(roles)) return []
  return roles.filter((role): role is OfficeMemberRole => role === 'admin' || role === 'member' || role === 'guest')
}

export function evaluateZoneCapacity(
  capacity: number | null | undefined,
  occupantCount: number
): { allowed: true } | { allowed: false, reason: string } {
  if (!capacity || capacity < 1) {
    return { allowed: true }
  }

  if (occupantCount >= capacity) {
    return { allowed: false, reason: 'room is full' }
  }

  return { allowed: true }
}

export function applyParticipantEvict(
  actor: ParticipantLite,
  target: ParticipantLite | undefined,
  now: number
): { allowed: true, send: OutboundMessage, broadcast: OutboundMessage } | { allowed: false, send: OutboundMessage } {
  actor.lastSeenAt = now

  if (actor.role !== 'admin') {
    return {
      allowed: false,
      send: { type: 'error', message: 'Only office admins can remove someone from a room.' }
    }
  }

  if (!target) {
    return {
      allowed: false,
      send: { type: 'error', message: 'That participant is no longer in the office.' }
    }
  }

  if (!target.currentZoneId) {
    return {
      allowed: false,
      send: { type: 'error', message: 'That participant is not currently in a room.' }
    }
  }

  const zoneId = target.currentZoneId
  target.currentZoneId = null
  target.lastSeenAt = now

  return {
    allowed: true,
    send: { type: 'zone:evicted', zoneId, by: actor.handle },
    broadcast: { type: 'participant:moved', handle: target.handle, zoneId: null }
  }
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
  now: number
): { send: OutboundMessage, broadcast: OutboundMessage } {
  p.currentZoneId = zoneId
  p.lastSeenAt = now
  return {
    send: { type: 'zone:entered', zoneId },
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

export function applyZoneNotesUpdated(
  p: ParticipantLite,
  input: {
    zoneId: string
    notes: string
    version: number
    updatedAt: string | null
    updatedBy: string | null
  },
  now: number
): { allowed: true, broadcast: OutboundMessage } | { allowed: false, send: OutboundMessage } {
  p.lastSeenAt = now
  if (p.currentZoneId !== input.zoneId) {
    return {
      allowed: false,
      send: {
        type: 'error',
        message: 'You must be in the room to publish live room notes.'
      }
    }
  }

  return {
    allowed: true,
    broadcast: {
      type: 'zone:notes-updated',
      zoneId: input.zoneId,
      notes: input.notes.slice(0, 20_000),
      version: input.version,
      updatedAt: input.updatedAt,
      updatedBy: input.updatedBy
    }
  }
}

export function applyPresenceEvent(
  p: ParticipantLite,
  kind: OfficePresenceEventKind,
  target: OfficePresenceEventTarget,
  now: number
): { broadcast: OutboundMessage } {
  p.lastSeenAt = now
  return {
    broadcast: {
      type: 'presence:event',
      event: {
        id: `${p.handle}:${kind}:${now}`,
        kind,
        from: p.handle,
        target,
        createdAt: now,
        expiresAt: now + PRESENCE_EVENT_TTL_MS
      }
    }
  }
}
