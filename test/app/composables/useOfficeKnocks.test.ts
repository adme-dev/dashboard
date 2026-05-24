import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOfficeKnocks } from '~/app/composables/useOfficeKnocks'

describe('useOfficeKnocks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sendKnock generates a knockId, sets pendingKnock, and calls send()', () => {
    const sent: any[] = []
    const send = (msg: any) => { sent.push(msg) }
    const k = useOfficeKnocks({ send })
    k.sendKnock('zone-1')
    // knockId is a client-generated UUID — assert shape, not exact value
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'knock:request', targetZoneId: 'zone-1' })
    expect(typeof sent[0].knockId).toBe('string')
    expect(sent[0].knockId).toBeTruthy()
    // pendingKnock carries the same knockId immediately
    expect(k.pendingKnock.value?.targetZoneId).toBe('zone-1')
    expect(k.pendingKnock.value?.status).toBe('awaiting')
    expect(k.pendingKnock.value?.knockId).toBe(sent[0].knockId)
  })

  it('onIncoming sets incomingKnock', () => {
    const k = useOfficeKnocks({ send: () => {} })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    expect(k.incomingKnock.value).toMatchObject({ knockId: 'k-1', fromName: 'Alice' })
  })

  it('acceptKnock sends knock:accept and clears incomingKnock', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    k.acceptKnock()
    expect(sent).toEqual([{ type: 'knock:accept', knockId: 'k-1' }])
    expect(k.incomingKnock.value).toBeNull()
  })

  it('denyKnock sends knock:deny and clears incomingKnock', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    k.denyKnock()
    expect(sent).toEqual([{ type: 'knock:deny', knockId: 'k-1' }])
    expect(k.incomingKnock.value).toBeNull()
  })

  it('cancelKnock sends knock:cancel with the client-generated knockId', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.sendKnock('zone-1')
    const knockId = k.pendingKnock.value?.knockId
    k.cancelKnock()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual({ type: 'knock:cancel', knockId })
    expect(k.pendingKnock.value).toBeNull()
  })

  it('cancelKnock is a no-op when there is no pending knock', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.cancelKnock()
    expect(sent).toHaveLength(0)
    expect(k.pendingKnock.value).toBeNull()
  })

  it('onResult clears pendingKnock and returns the result for caller to toast', () => {
    const k = useOfficeKnocks({ send: () => {} })
    k.sendKnock('zone-1')
    const result = k.onResult({ knockId: 'k-1' as any, status: 'denied' })
    expect(k.pendingKnock.value).toBeNull()
    expect(result.status).toBe('denied')
  })

  it('onCancelled clears incomingKnock when knockId matches', () => {
    const k = useOfficeKnocks({ send: () => {} })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    k.onCancelled({ knockId: 'k-1' as any })
    expect(k.incomingKnock.value).toBeNull()
  })

  it('onCancelled is a no-op when knockId does not match the current incomingKnock', () => {
    const k = useOfficeKnocks({ send: () => {} })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    k.onCancelled({ knockId: 'k-different' as any })
    expect(k.incomingKnock.value).not.toBeNull()
  })
})

describe('sendPersonKnock', () => {
  it('emits knock:request-person with a fresh knockId', () => {
    const sent: any[] = []
    const knocks = useOfficeKnocks({ send: (m) => sent.push(m) })

    knocks.sendPersonKnock('user:target' as any)

    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('knock:request-person')
    expect(sent[0].targetHandle).toBe('user:target')
    expect(typeof sent[0].knockId).toBe('string')
    expect(sent[0].knockId.length).toBeGreaterThan(0)
    expect(knocks.pendingKnock.value?.knockId).toBe(sent[0].knockId)
  })

  it('cancelKnock works for a person knock', () => {
    const sent: any[] = []
    const knocks = useOfficeKnocks({ send: (m) => sent.push(m) })

    knocks.sendPersonKnock('user:target' as any)
    sent.length = 0
    knocks.cancelKnock()

    expect(sent[0].type).toBe('knock:cancel')
    expect(knocks.pendingKnock.value).toBeNull()
  })
})

describe('onResult — new statuses from 1c.0', () => {
  it('clears pending and returns offline status', () => {
    const knocks = useOfficeKnocks({ send: () => {} })
    knocks.sendPersonKnock('user:target' as any)
    const pendingId = knocks.pendingKnock.value!.knockId

    const res = knocks.onResult({ knockId: pendingId, status: 'offline' } as any)

    expect(res.status).toBe('offline')
    expect(knocks.pendingKnock.value).toBeNull()
  })

  it('returns open-room with targetZoneId', () => {
    const knocks = useOfficeKnocks({ send: () => {} })
    knocks.sendPersonKnock('user:target' as any)
    const pendingId = knocks.pendingKnock.value!.knockId

    const res = knocks.onResult({
      knockId: pendingId,
      status: 'open-room',
      targetZoneId: 'meeting-1',
    } as any)

    expect(res.status).toBe('open-room')
    expect(res.targetZoneId).toBe('meeting-1')
    expect(knocks.pendingKnock.value).toBeNull()
  })
})
