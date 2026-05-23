import { describe, it, expect } from 'vitest'
import {
  applyStatusSet,
  applyZoneEnter,
  applyZoneLeave,
  applyKnockRequest,
  applyKnockAccept,
  applyKnockDeny,
  applyKnockCancel,
  applyKnockTimeout,
  type ParticipantLite,
  type KnockState,
  type KnockStateEntry,
} from '../../../workers/office-room/src/handlers'

const emptyKnockState = (): KnockState => ({
  byId: new Map(),
  acceptedByZone: new Map(),
})

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

  it('applyZoneEnter updates currentZoneId and emits zone:joined + participant:moved', () => {
    const p = baseP()
    const media = {
      authToken: 'tok',
      meetingId: 'meet-1',
      participantId: 'p-1',
      presetName: 'staff_full' as const,
      expiresAt: 1_000,
    }
    const out = applyZoneEnter(p, 'zone-1', media, 100)
    expect(p.currentZoneId).toBe('zone-1')
    expect(p.lastSeenAt).toBe(100)
    expect(out.send).toEqual({ type: 'zone:joined', zoneId: 'zone-1', media })
    expect(out.broadcast).toEqual({ type: 'participant:moved', handle: 'user:u1', zoneId: 'zone-1' })
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

// =============================================================================
// Knock handler tests — Phase 1c.1
// =============================================================================

const baseKnockEntry = (): KnockStateEntry => ({
  knockId: 'k-1',
  knockerHandle: 'user:alice',
  knockerName: 'Alice',
  knockerWsId: 'ws-a',
  knockeeHandle: 'user:bob',
  knockeeWsId: 'ws-b',
  zoneId: 'zone-focus-1',
  startedAt: 1000,
  expiresAt: 31_000,
})

describe('applyKnockRequest', () => {
  const baseInput = {
    state: emptyKnockState(),
    knockId: 'k-1',
    knockerHandle: 'user:alice',
    knockerName: 'Alice',
    knockerWsId: 'ws-a',
    knockeeHandle: 'user:bob',
    knockeeWsId: 'ws-b',
    zoneId: 'zone-focus-1',
    now: 1000,
    ttlMs: 30_000,
  }

  it('inserts a new knock entry and returns knock:incoming for knockee', () => {
    const input = { ...baseInput, state: emptyKnockState() }
    const out = applyKnockRequest(input)
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(input.state.byId.size).toBe(1)
    expect(input.state.byId.get('k-1')?.zoneId).toBe('zone-focus-1')
    expect(input.state.byId.get('k-1')?.expiresAt).toBe(31_000)
    expect(out.toKnockee).toEqual({
      type: 'knock:incoming',
      knockId: 'k-1',
      fromHandle: 'user:alice',
      fromName: 'Alice',
      zoneId: 'zone-focus-1',
      ttlMs: 30_000,
    })
  })

  it('rejects when a knock with same knockId already exists', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {} as KnockStateEntry)
    const out = applyKnockRequest({ ...baseInput, state })
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.reason).toBe('duplicate-knock-id')
  })
})

describe('applyKnockAccept', () => {
  it('clears the entry, marks zone busy, returns dispatch info', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', baseKnockEntry())
    const out = applyKnockAccept({ state, knockId: 'k-1' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
    expect(state.acceptedByZone.get('zone-focus-1')).toBe('k-1')
    expect(out.knockerHandle).toBe('user:alice')
    expect(out.knockerWsId).toBe('ws-a')
    expect(out.zoneId).toBe('zone-focus-1')
  })

  it('rejects when knockId not found', () => {
    const state = emptyKnockState()
    const out = applyKnockAccept({ state, knockId: 'missing' })
    expect(out.kind).toBe('error')
  })
})

describe('applyKnockDeny', () => {
  it('clears the entry and returns knock:result with denied status', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', baseKnockEntry())
    const out = applyKnockDeny({ state, knockId: 'k-1' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
    expect(out.toKnocker).toEqual({
      type: 'knock:result',
      knockId: 'k-1',
      status: 'denied',
    })
    expect(out.knockerWsId).toBe('ws-a')
  })

  it('rejects when knockId not found', () => {
    const out = applyKnockDeny({ state: emptyKnockState(), knockId: 'missing' })
    expect(out.kind).toBe('error')
  })
})

describe('applyKnockCancel', () => {
  it('clears the entry; no dispatch to either party', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', baseKnockEntry())
    const out = applyKnockCancel({ state, knockId: 'k-1', cancellerWsId: 'ws-a' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
  })

  it('rejects when cancellation does not come from the original knocker', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', baseKnockEntry())
    const out = applyKnockCancel({ state, knockId: 'k-1', cancellerWsId: 'ws-c' })
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.reason).toBe('not-canceller')
  })
})

describe('applyKnockTimeout', () => {
  it('clears the entry and returns knock:result with timeout status', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', baseKnockEntry())
    const out = applyKnockTimeout({ state, knockId: 'k-1' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
    expect(out.toKnocker.status).toBe('timeout')
    expect(out.knockerWsId).toBe('ws-a')
  })

  it('returns error: not-found when entry already gone (accept beat the timer)', () => {
    const out = applyKnockTimeout({ state: emptyKnockState(), knockId: 'missing' })
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.reason).toBe('not-found')
  })
})
