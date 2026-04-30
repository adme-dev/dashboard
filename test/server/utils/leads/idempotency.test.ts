import { describe, it, expect } from 'vitest'
import { deliveryIdempotencyKey } from '../../../../server/utils/leads/idempotency'

describe('deliveryIdempotencyKey', () => {
  it('is deterministic for same lead+destination', () => {
    const a = deliveryIdempotencyKey('lead-1', 'dest-7')
    const b = deliveryIdempotencyKey('lead-1', 'dest-7')
    expect(a).toBe(b)
  })
  it('differs across leads or destinations', () => {
    expect(deliveryIdempotencyKey('lead-1', 'dest-7'))
      .not.toBe(deliveryIdempotencyKey('lead-2', 'dest-7'))
    expect(deliveryIdempotencyKey('lead-1', 'dest-7'))
      .not.toBe(deliveryIdempotencyKey('lead-1', 'dest-8'))
  })
  it('returns a stable hex string of fixed length', () => {
    const k = deliveryIdempotencyKey('lead-1', 'dest-7')
    expect(k).toMatch(/^[a-f0-9]{32}$/)
  })
})
