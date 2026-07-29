import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findEmailLeadDuplicateSignal } from '../../../../server/utils/leads/emailDuplicateSignal'

describe('email advisory duplicate signal', () => {
  beforeEach(() => {
    process.env.LEAD_IDENTITY_HMAC_KEY = 'test-identity-key'
  })

  it('returns a same-client HMAC identity match without exposing identity values', async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ lead_id: '11111111-1111-4111-8111-111111111111', candidate_client_id: '22222222-2222-4222-8222-222222222222', match_method: 'email_hmac' }] })) }
    await expect(findEmailLeadDuplicateSignal(db as never, {
      clientId: '22222222-2222-4222-8222-222222222222', leadId: '33333333-3333-4333-8333-333333333333',
      fieldData: { email: 'person@example.test' }, occurredAt: '2026-07-29T00:00:00.000Z'
    })).resolves.toEqual({ possibleDuplicateOfLeadId: '11111111-1111-4111-8111-111111111111', matchBasis: 'email_hmac', confidence: 0.9, windowHours: 168 })
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('person@example.test')
  })

  it.each([
    [{ email: 'person@example.test' }, 'email_hmac', 0.9],
    [{ phone: '0412 345 678' }, 'phone_hmac', 0.9],
    [{ email: 'person@example.test', phone: '0412 345 678' }, 'email_phone_hmac', 0.98]
  ])('reports the safe basis for matching identity evidence', async (fieldData, matchBasis, confidence) => {
    const db = { query: vi.fn(async () => ({ rows: [{
      lead_id: '11111111-1111-4111-8111-111111111111',
      candidate_client_id: '22222222-2222-4222-8222-222222222222',
      match_method: matchBasis
    }] })) }
    await expect(findEmailLeadDuplicateSignal(db as never, {
      clientId: '22222222-2222-4222-8222-222222222222',
      leadId: '33333333-3333-4333-8333-333333333333',
      fieldData,
      occurredAt: '2026-07-29T00:00:00.000Z'
    })).resolves.toEqual({
      possibleDuplicateOfLeadId: '11111111-1111-4111-8111-111111111111',
      matchBasis,
      confidence,
      windowHours: 168
    })
  })

  it('rejects a candidate lead whose authoritative client differs from the identity link client', async () => {
    const db = { query: vi.fn(async () => ({ rows: [{
      lead_id: '11111111-1111-4111-8111-111111111111',
      candidate_client_id: '99999999-9999-4999-8999-999999999999',
      match_method: 'email_hmac'
    }] })) }
    await expect(findEmailLeadDuplicateSignal(db as never, {
      clientId: '22222222-2222-4222-8222-222222222222',
      leadId: '33333333-3333-4333-8333-333333333333',
      fieldData: { email: 'person@example.test' },
      occurredAt: '2026-07-29T00:00:00.000Z'
    })).resolves.toBeNull()
  })

  it.each(['same lead', 'outside 168-hour window', 'conflicting identity profiles'])(
    'returns no signal for a %s candidate',
    async () => {
      const db = { query: vi.fn(async () => ({ rows: [] })) }
      await expect(findEmailLeadDuplicateSignal(db as never, {
        clientId: '22222222-2222-4222-8222-222222222222',
        leadId: '33333333-3333-4333-8333-333333333333',
        fieldData: { email: 'person@example.test', phone: '0412 345 678' },
        occurredAt: '2026-07-29T00:00:00.000Z'
      })).resolves.toBeNull()
    }
  )
})
