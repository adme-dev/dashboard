import { describe, it, expect } from 'vitest'
import {
  applyParticipantEvict,
  applyStatusSet,
  applyPresenceEvent,
  applyZoneEnter,
  applyZoneLeave,
  applyZoneNotesUpdated,
  evaluateZoneCapacity,
  evaluateGuestBadgeIdentity,
  evaluateZoneEntry,
  type ParticipantLite
} from '../../../workers/office-room/src/handlers'

const baseP = (): ParticipantLite => ({
  handle: 'user:u1',
  status: 'available',
  currentZoneId: null,
  lastSeenAt: 0
})

describe('OfficeRoom handlers', () => {
  it('applyStatusSet updates status and emits participant:updated', () => {
    const p = baseP()
    const out = applyStatusSet(p, 'dnd', 42)
    expect(p.status).toBe('dnd')
    expect(p.lastSeenAt).toBe(42)
    expect(out.broadcast).toEqual({
      type: 'participant:updated',
      handle: 'user:u1',
      status: 'dnd'
    })
  })

  it('applyZoneEnter updates currentZoneId and emits both send + broadcast', () => {
    const p = baseP()
    const out = applyZoneEnter(p, 'zone-1', 100)
    expect(p.currentZoneId).toBe('zone-1')
    expect(p.lastSeenAt).toBe(100)
    expect(out.send).toEqual({ type: 'zone:entered', zoneId: 'zone-1' })
    expect(out.broadcast).toEqual({
      type: 'participant:moved',
      handle: 'user:u1',
      zoneId: 'zone-1'
    })
  })

  it('applyZoneLeave clears currentZoneId and emits participant:moved with null', () => {
    const p: ParticipantLite = { ...baseP(), currentZoneId: 'zone-1' }
    const out = applyZoneLeave(p, 200)
    expect(p.currentZoneId).toBeNull()
    expect(p.lastSeenAt).toBe(200)
    expect(out.broadcast).toEqual({
      type: 'participant:moved',
      handle: 'user:u1',
      zoneId: null
    })
  })

  it('applyParticipantEvict lets admins remove a participant from a room', () => {
    const admin: ParticipantLite = { ...baseP(), role: 'admin', handle: 'user:admin' }
    const target: ParticipantLite = { ...baseP(), handle: 'user:u2', currentZoneId: 'zone-1' }
    const out = applyParticipantEvict(admin, target, 250)

    expect(admin.lastSeenAt).toBe(250)
    expect(target.currentZoneId).toBeNull()
    expect(target.lastSeenAt).toBe(250)
    expect(out).toEqual({
      allowed: true,
      send: {
        type: 'zone:evicted',
        zoneId: 'zone-1',
        by: 'user:admin'
      },
      broadcast: {
        type: 'participant:moved',
        handle: 'user:u2',
        zoneId: null
      }
    })
  })

  it('applyParticipantEvict rejects non-admin actors', () => {
    const member: ParticipantLite = { ...baseP(), role: 'member' }
    const target: ParticipantLite = { ...baseP(), handle: 'user:u2', currentZoneId: 'zone-1' }
    const out = applyParticipantEvict(member, target, 260)

    expect(target.currentZoneId).toBe('zone-1')
    expect(out).toEqual({
      allowed: false,
      send: {
        type: 'error',
        message: 'Only office admins can remove someone from a room.'
      }
    })
  })

  it('evaluateZoneEntry limits guests to their approved room', () => {
    expect(evaluateZoneEntry({
      isGuest: true,
      allowedZoneId: 'zone-1'
    }, 'zone-2')).toEqual({
      allowed: false,
      reason: 'guest room access is limited to the approved room'
    })

    expect(evaluateZoneEntry({
      isGuest: true,
      allowedZoneId: 'zone-1'
    }, 'zone-1')).toEqual({ allowed: true })
  })

  it('evaluateZoneEntry leaves staff unrestricted', () => {
    expect(evaluateZoneEntry({
      isGuest: false,
      role: 'member',
      allowedZoneId: 'zone-1'
    }, 'zone-2')).toEqual({ allowed: true })
  })

  it('evaluateZoneEntry enforces private room role allow-lists for staff', () => {
    expect(evaluateZoneEntry({
      isGuest: false,
      role: 'member',
      allowedZoneId: null
    }, 'zone-1', {
      zone_type: 'meeting',
      is_private: true,
      acl: { allowed_roles: ['member'] }
    })).toEqual({ allowed: true })

    expect(evaluateZoneEntry({
      isGuest: false,
      role: 'guest',
      allowedZoneId: null
    }, 'zone-1', {
      zone_type: 'meeting',
      is_private: true,
      acl: { allowed_roles: ['member'] }
    })).toEqual({
      allowed: false,
      reason: 'role guest not in zone allow-list'
    })
  })

  it('evaluateZoneEntry treats private rooms without role allow-lists as admin-only', () => {
    expect(evaluateZoneEntry({
      isGuest: false,
      role: 'member',
      allowedZoneId: null
    }, 'zone-1', {
      zone_type: 'meeting',
      is_private: true,
      acl: {}
    })).toEqual({
      allowed: false,
      reason: 'private zone admin-only'
    })

    expect(evaluateZoneEntry({
      isGuest: false,
      role: 'admin',
      allowedZoneId: null
    }, 'zone-1', {
      zone_type: 'meeting',
      is_private: true,
      acl: {}
    })).toEqual({ allowed: true })
  })

  it('evaluateZoneEntry denies guests without an approved room', () => {
    expect(evaluateZoneEntry({
      isGuest: true,
      allowedZoneId: null
    }, 'zone-2')).toEqual({
      allowed: false,
      reason: 'guest room access requires an approved room'
    })
  })

  it('evaluateZoneCapacity allows unknown capacity and denies full rooms', () => {
    expect(evaluateZoneCapacity(undefined, 100)).toEqual({ allowed: true })
    expect(evaluateZoneCapacity(null, 100)).toEqual({ allowed: true })
    expect(evaluateZoneCapacity(2, 1)).toEqual({ allowed: true })
    expect(evaluateZoneCapacity(2, 2)).toEqual({
      allowed: false,
      reason: 'room is full'
    })
  })

  it('evaluateGuestBadgeIdentity denies guests without a badge id', () => {
    expect(evaluateGuestBadgeIdentity({
      isGuest: true,
      guestBadgeId: null
    })).toEqual({
      allowed: false,
      reason: 'guest badge is required'
    })
  })

  it('evaluateGuestBadgeIdentity leaves staff unrestricted', () => {
    expect(evaluateGuestBadgeIdentity({
      isGuest: false,
      guestBadgeId: null
    })).toEqual({ allowed: true })
  })

  it('evaluateGuestBadgeIdentity allows guests with a badge id', () => {
    expect(evaluateGuestBadgeIdentity({
      isGuest: true,
      guestBadgeId: 'badge-1'
    })).toEqual({ allowed: true })
  })

  it('applyPresenceEvent emits a short-lived knock/wave event', () => {
    const p = baseP()
    const out = applyPresenceEvent(p, 'knock', { type: 'zone', zoneId: 'zone-1' }, 300)

    expect(p.lastSeenAt).toBe(300)
    expect(out.broadcast).toEqual({
      type: 'presence:event',
      event: {
        id: 'user:u1:knock:300',
        kind: 'knock',
        from: 'user:u1',
        target: { type: 'zone', zoneId: 'zone-1' },
        createdAt: 300,
        expiresAt: 5300
      }
    })
  })

  it('applyPresenceEvent supports raised-hand room activity', () => {
    const p = baseP()
    const out = applyPresenceEvent(p, 'raise_hand', { type: 'zone', zoneId: 'zone-1' }, 400)

    expect(out.broadcast).toMatchObject({
      type: 'presence:event',
      event: {
        id: 'user:u1:raise_hand:400',
        kind: 'raise_hand',
        from: 'user:u1',
        target: { type: 'zone', zoneId: 'zone-1' },
        createdAt: 400,
        expiresAt: 5400
      }
    })
  })

  it('applyZoneNotesUpdated broadcasts sanitized notes for participants in the room', () => {
    const p: ParticipantLite = { ...baseP(), currentZoneId: 'zone-1' }
    const out = applyZoneNotesUpdated(p, {
      zoneId: 'zone-1',
      notes: `${'x'.repeat(20_001)}`,
      version: 3,
      updatedAt: '2026-05-26T00:00:00.000Z',
      updatedBy: 'user-1'
    }, 400)

    expect(p.lastSeenAt).toBe(400)
    expect(out).toEqual({
      allowed: true,
      broadcast: {
        type: 'zone:notes-updated',
        zoneId: 'zone-1',
        notes: 'x'.repeat(20_000),
        version: 3,
        updatedAt: '2026-05-26T00:00:00.000Z',
        updatedBy: 'user-1'
      }
    })
  })

  it('applyZoneNotesUpdated rejects participants outside the room', () => {
    const p: ParticipantLite = { ...baseP(), currentZoneId: 'zone-2' }
    const out = applyZoneNotesUpdated(p, {
      zoneId: 'zone-1',
      notes: 'Decision log',
      version: 3,
      updatedAt: null,
      updatedBy: null
    }, 450)

    expect(p.lastSeenAt).toBe(450)
    expect(out).toEqual({
      allowed: false,
      send: {
        type: 'error',
        message: 'You must be in the room to publish live room notes.'
      }
    })
  })
})
