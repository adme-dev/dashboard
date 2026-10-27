import { describe, expect, it } from 'vitest'
import { isSyntheticLead, leadAckIdempotencyKey, leadAckRecipientHash } from '~~/server/utils/leads/ack/policy'

const lead = { client_id: 'c1', source: 'meta' as const, source_lead_id: 'meta-123' }

describe('lead ack policy', () => {
  it('derives the key from the submission identity, not the lead row or delivery', () => {
    const a = leadAckIdempotencyKey(lead, { rule_destination_id: 'd1', idempotency_key: 'x' })
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(leadAckIdempotencyKey(lead, { rule_destination_id: 'd1', idempotency_key: 'y' })).toBe(a)
    expect(leadAckIdempotencyKey({ ...lead, source_lead_id: 'meta-124' }, { rule_destination_id: 'd1', idempotency_key: 'x' })).not.toBe(a)
    expect(leadAckIdempotencyKey({ ...lead, client_id: 'c2' }, { rule_destination_id: 'd1', idempotency_key: 'x' })).not.toBe(a)
    expect(leadAckIdempotencyKey(lead, { rule_destination_id: 'd2', idempotency_key: 'x' })).not.toBe(a)
  })

  it('hashes recipients case-insensitively', () => {
    expect(leadAckRecipientHash('Jane@Example.net')).toBe(leadAckRecipientHash('jane@example.net'))
  })

  it('treats a plain lead as real', () => {
    expect(isSyntheticLead({ is_test: false, test_run_id: null, source_lead_id: 'meta-1' })).toBe(false)
  })
})
