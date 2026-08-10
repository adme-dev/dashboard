import { describe, expect, it, vi } from 'vitest'

import {
  claimCrmSearchOperationsForPublication,
  confirmCrmSearchOperationPublished,
  rescheduleCrmSearchOperationPublication
} from '../../../server/utils/crm/searchIndex/publicationRepository'

const operationId = '11111111-1111-4111-8111-111111111111'
const claimToken = '22222222-2222-4222-8222-222222222222'
const now = '2033-05-18T03:33:20.000Z'

describe('CRM search transport publication repository', () => {
  it('claims only bounded pending-transport work with its own SKIP LOCKED lease', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [{
        operation_id: operationId,
        claim_token: claimToken,
        claim_generation: '4'
      }],
      rowCount: 1
    }))
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    await expect(claimCrmSearchOperationsForPublication({
      limit: 25,
      leaseSeconds: 60,
      now
    }, { transactionWithoutRetry } as never)).resolves.toEqual([{
      operationId,
      claimToken,
      claimGeneration: 4
    }])

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain('state = \'pending_transport\'')
    expect(sql).toContain('FOR UPDATE OF operation SKIP LOCKED')
    expect(sql).toContain('crm_search_global_control')
    expect(sql).toContain('crm_search_policies')
    expect(sql).toContain('operation.desired_action = \'upsert\'')
    expect(sql).toContain('control.state = \'delete_only\'')
    expect(sql).toContain('crm_search_client_teardowns')
    expect(sql).toContain('transport_attempt_count = operation.transport_attempt_count + 1')
    expect(sql).not.toContain('processing_attempt_count')
    expect(sql).not.toContain('state = \'processing\'')
    expect(query.mock.calls[0]?.[1]).toEqual([now, 25, 60])
  })

  it('confirms publication only by exact operation, token, generation, and transport state', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [{ id: operationId }], rowCount: 1
    }))
    await expect(confirmCrmSearchOperationPublished({
      operationId,
      claimToken,
      claimGeneration: 4,
      publishedAt: now
    }, { query } as never)).resolves.toBe(true)

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain('state = \'queued\'')
    expect(sql).toContain('id = $1')
    expect(sql).toContain('lease_token = $2')
    expect(sql).toContain('lease_generation = $3')
    expect(sql).toContain('state = \'pending_transport\'')
    expect(sql).toContain('lease_token = NULL')
    expect(query.mock.calls[0]?.[1]).toEqual([operationId, claimToken, 4, now])
  })

  it('reschedules a failed send by the same CAS without crossing into processor retry state', async () => {
    const nextAttemptAt = '2033-05-18T03:33:50.000Z'
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }))
    await expect(rescheduleCrmSearchOperationPublication({
      operationId,
      claimToken,
      claimGeneration: 4,
      errorClass: 'queue_send_failed',
      nextAttemptAt
    }, { query } as never)).resolves.toBe(true)

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain('state = \'pending_transport\'')
    expect(sql).toContain('error_class = $4')
    expect(sql).toContain('next_attempt_at = $5')
    expect(sql).not.toContain('state = \'retryable\'')
    expect(sql).not.toContain('processing_attempt_count')
    expect(query.mock.calls[0]?.[1]).toEqual([
      operationId,
      claimToken,
      4,
      'queue_send_failed',
      nextAttemptAt
    ])
  })

  it('returns false for a stale publish-confirm or reschedule CAS', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }))
    await expect(confirmCrmSearchOperationPublished({
      operationId,
      claimToken,
      claimGeneration: 4,
      publishedAt: now
    }, { query } as never)).resolves.toBe(false)
    await expect(rescheduleCrmSearchOperationPublication({
      operationId,
      claimToken,
      claimGeneration: 4,
      errorClass: 'queue_unavailable',
      nextAttemptAt: '2033-05-18T03:33:50.000Z'
    }, { query } as never)).resolves.toBe(false)
  })

  it.each([
    { limit: 0, leaseSeconds: 60, now },
    { limit: 101, leaseSeconds: 60, now },
    { limit: 25, leaseSeconds: 0, now },
    { limit: 25, leaseSeconds: 901, now },
    { limit: 25, leaseSeconds: 60, now: 'not-a-time' }
  ])('rejects unsafe claim bounds before starting a transaction: %o', async (input) => {
    const transactionWithoutRetry = vi.fn()
    await expect(claimCrmSearchOperationsForPublication(
      input,
      { transactionWithoutRetry } as never
    )).rejects.toThrow('crm_search_invalid_publication_claim')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })

  it('rejects unbounded error classes before attempting a reschedule', async () => {
    const query = vi.fn()
    await expect(rescheduleCrmSearchOperationPublication({
      operationId,
      claimToken,
      claimGeneration: 4,
      errorClass: 'raw provider error: customer body',
      nextAttemptAt: '2033-05-18T03:33:50.000Z'
    }, { query } as never)).rejects.toThrow('crm_search_invalid_publication_claim')
    expect(query).not.toHaveBeenCalled()
  })
})
