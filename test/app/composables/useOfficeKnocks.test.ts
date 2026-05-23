import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useOfficeKnocks } from '~/app/composables/useOfficeKnocks'

describe('useOfficeKnocks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sendKnock sets pendingKnock and calls send()', () => {
    const sent: any[] = []
    const send = (msg: any) => { sent.push(msg) }
    const k = useOfficeKnocks({ send })
    k.sendKnock('zone-1')
    expect(sent).toEqual([{ type: 'knock:request', targetZoneId: 'zone-1' }])
    expect(k.pendingKnock.value).toEqual({ targetZoneId: 'zone-1', status: 'awaiting' })
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

  it('cancelKnock sends knock:cancel when pendingKnock has a knockId', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.sendKnock('zone-1')
    // Simulate server echoing a knockId back via result (we use it in cancel)
    k.pendingKnock.value = { ...k.pendingKnock.value!, knockId: 'k-1' as any }
    k.cancelKnock()
    expect(sent[1]).toEqual({ type: 'knock:cancel', knockId: 'k-1' })
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
