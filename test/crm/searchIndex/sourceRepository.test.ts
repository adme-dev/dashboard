import { describe, expect, it, vi } from 'vitest'
import {
  claimCrmSearchDirtySources,
  completeCrmSearchDirtySourceClaim,
  releaseCrmSearchDirtySourceClaim
} from '~~/server/utils/crm/searchIndex/sourceRepository'

const claimed = {
  id: '11111111-1111-4111-8111-111111111111',
  organisation_scope_id: '22222222-2222-4222-8222-222222222222',
  client_id: '33333333-3333-4333-8333-333333333333',
  entity_type: 'company',
  entity_id: '44444444-4444-4444-8444-444444444444',
  source_revision: '4',
  desired_action: 'upsert',
  event_sequence: '10',
  claim_token: '55555555-5555-4555-8555-555555555555',
  claim_generation: '2',
  claim_lease_expires_at: '2026-08-10T00:01:00.000Z',
  attempt_count: 1
}

describe('CRM search source repository', () => {
  it('claims bounded dirty rows with SKIP LOCKED in a one-shot transaction', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [claimed] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    const rows = await claimCrmSearchDirtySources({
      limit: 25,
      leaseSeconds: 60,
      now: '2026-08-10T00:00:00.000Z'
    }, { transactionWithoutRetry } as never)

    expect(rows).toEqual([expect.objectContaining({
      sourceRevision: 4,
      eventSequence: 10,
      claimGeneration: 2
    })])
    expect(transactionWithoutRetry).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE SKIP LOCKED')
    expect(query.mock.calls[0]?.[0]).toContain('claim_generation = dirty.claim_generation + 1')
  })

  it('clears a dirty row only with revision, event-sequence, token, and generation CAS', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ completed: true }] })
    await expect(completeCrmSearchDirtySourceClaim({
      id: claimed.id,
      sourceRevision: 4,
      eventSequence: 10,
      claimToken: claimed.claim_token,
      claimGeneration: 2
    }, { query } as never)).resolves.toBe(true)

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain('crm_search_complete_source_dirty_claim')
    expect(sql).not.toMatch(/DELETE\s+FROM\s+crm_search_source_dirty/i)
    expect(query.mock.calls[0]?.[1]).toEqual([
      claimed.id, 4, 10, claimed.claim_token, 2
    ])
  })

  it('does not clear a newer concurrent dirty intent through a stale claim', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ completed: false }] })
    await expect(completeCrmSearchDirtySourceClaim({
      id: claimed.id,
      sourceRevision: 4,
      eventSequence: 10,
      claimToken: claimed.claim_token,
      claimGeneration: 2
    }, { query } as never)).resolves.toBe(false)
  })

  it('releases retryable claims with only a bounded redacted error class and CAS', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })
    await expect(releaseCrmSearchDirtySourceClaim({
      id: claimed.id,
      claimToken: claimed.claim_token,
      claimGeneration: 2,
      errorClass: 'provider_unavailable',
      nextAttemptAt: '2026-08-10T00:05:00.000Z'
    }, { query } as never)).resolves.toBe(true)
    expect(query.mock.calls[0]?.[1]).not.toContain(expect.stringContaining('error body'))
  })

  it('rejects unbounded claims before opening a transaction', async () => {
    const transactionWithoutRetry = vi.fn()
    await expect(claimCrmSearchDirtySources({
      limit: 0,
      leaseSeconds: 60,
      now: '2026-08-10T00:00:00.000Z'
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_invalid_claim')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })
})
