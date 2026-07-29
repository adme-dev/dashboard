import { describe, expect, it, vi } from 'vitest'
import { findEmailLeadDuplicateSignal } from '../../../../server/utils/leads/emailDuplicateSignal'

describe('email advisory duplicate signal', () => {
  it('returns a same-client HMAC identity match without exposing identity values', async () => {
    process.env.LEAD_IDENTITY_HMAC_KEY = 'test-identity-key'
    const db = { query: vi.fn(async () => ({ rows: [{ lead_id: '11111111-1111-4111-8111-111111111111', match_method: 'email_hmac' }] })) }
    await expect(findEmailLeadDuplicateSignal(db as never, {
      clientId: '22222222-2222-4222-8222-222222222222', leadId: '33333333-3333-4333-8333-333333333333',
      fieldData: { email: 'person@example.test' }, occurredAt: '2026-07-29T00:00:00.000Z'
    })).resolves.toEqual({ possibleDuplicateOfLeadId: '11111111-1111-4111-8111-111111111111', matchBasis: 'email_hmac', confidence: 0.9, windowHours: 168 })
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('person@example.test')
  })
})
