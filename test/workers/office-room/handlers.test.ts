import { describe, it, expect } from 'vitest'
import {
  applyStatusSet,
  applyZoneEnter,
  applyZoneLeave,
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
})
