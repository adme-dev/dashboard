import { describe, it, expect } from 'vitest'
import { validateCommitmentBody } from '../../../server/utils/cashflowCommitments'

const base = {
  supplier: 'Wages — weekly pay run',
  amountCents: 1_650_000,
  expectedDate: '2026-08-14',
  recurrence: 'weekly',
  paymentAccount: 'NAB_BUSINESS',
  status: 'expected',
  confidence: 'committed'
}

describe('validateCommitmentBody source enum', () => {
  it('accepts statutory-seed as a source', () => {
    const v = validateCommitmentBody({ ...base, source: 'statutory-seed' }, { partial: false })
    expect(v.source).toBe('statutory-seed')
  })

  it('still rejects unknown sources', () => {
    expect(() => validateCommitmentBody({ ...base, source: 'robot-guess' }, { partial: false })).toThrow()
  })
})
