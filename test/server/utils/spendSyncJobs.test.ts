import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('spendSyncJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({ platform: 'google', status: 'failed', synced_count: 0, total_accounts: 2 })
  })

  it('marks a completed bulk job as failed when failures produced zero synced campaigns', async () => {
    const { completeSpendSyncJob } = await import('~~/server/utils/spendSyncJobs')

    await completeSpendSyncJob('job-1', {
      synced: 0,
      totalSpend: 0,
      failures: [{ account: 'A', reason: 'Token refresh failed' }]
    })

    expect(mockQueryOne).toHaveBeenCalledOnce()
    const [sql, params] = mockQueryOne.mock.calls[0]!
    expect(sql).toContain('THEN \'failed\' ELSE \'completed\'')
    expect(sql).toContain('Sync finished with account failures and no campaigns updated')
    expect(params).toEqual([
      'job-1',
      0,
      0,
      JSON.stringify([{ account: 'A', reason: 'Token refresh failed' }])
    ])
  })

  it('marks the final chunked fan-in update as failed when all accounts failed', async () => {
    const { recordSyncJobAccountResult } = await import('~~/server/utils/spendSyncJobs')

    await recordSyncJobAccountResult('job-1', {
      synced: 0,
      totalSpend: 0,
      failures: [{ account: 'A', reason: 'Token refresh failed' }]
    })

    expect(mockQueryOne).toHaveBeenCalledOnce()
    const [sql, params] = mockQueryOne.mock.calls[0]!
    expect(sql).toContain('THEN \'failed\'')
    expect(sql).toContain('jsonb_array_length(failures || $4::jsonb) > 0')
    expect(params).toEqual([
      'job-1',
      0,
      0,
      JSON.stringify([{ account: 'A', reason: 'Token refresh failed' }])
    ])
  })
})
