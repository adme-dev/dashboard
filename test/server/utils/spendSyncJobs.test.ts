import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockCreateBulkNotifications = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createBulkNotifications: (...args: unknown[]) => mockCreateBulkNotifications(...args)
}))

describe('spendSyncJobs', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockCreateBulkNotifications.mockReset()
    mockQueryOne.mockResolvedValue({ platform: 'google', status: 'failed', synced_count: 0, total_accounts: 2 })
  })

  it('alerts owners when a completed sync covers fewer campaigns than the previous run', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        platform: 'meta',
        period: '2026-08',
        status: 'completed',
        synced_count: 70,
        total_accounts: 6,
      })
      .mockResolvedValueOnce({ synced_count: 88, finished_at: '2026-08-19T08:28:14.371Z' })
      .mockResolvedValueOnce({ stale_rows: 0, total_rows: 88, oldest_synced_at: '2026-08-19T08:28:14.371Z' })
    mockQueryRows.mockResolvedValueOnce([{ id: 'owner-1' }])
    const { completeSpendSyncJob } = await import('~~/server/utils/spendSyncJobs')

    await completeSpendSyncJob('job-current', { synced: 70, totalSpend: 32912.40 })

    expect(mockCreateBulkNotifications).toHaveBeenCalledWith(['owner-1'], expect.objectContaining({
      title: 'Meta campaign coverage dropped',
      metadata: expect.objectContaining({
        kind: 'spend_sync_coverage_drop',
        previousCampaignCount: 88,
        currentCampaignCount: 70,
        missingCampaignCount: 18,
      })
    }))
  })

  it('does not alert when campaign coverage is unchanged or higher', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        platform: 'google',
        period: '2026-08',
        status: 'completed',
        synced_count: 91,
        total_accounts: 4,
      })
      .mockResolvedValueOnce({ synced_count: 88, finished_at: '2026-08-18T08:28:14.371Z' })
      .mockResolvedValueOnce({ stale_rows: 0, total_rows: 91, oldest_synced_at: '2026-08-19T08:28:14.371Z' })
    const { completeSpendSyncJob } = await import('~~/server/utils/spendSyncJobs')

    await completeSpendSyncJob('job-current', { synced: 91, totalSpend: 40000 })

    expect(mockCreateBulkNotifications).not.toHaveBeenCalled()
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
      JSON.stringify([{ account: 'A', reason: 'Token refresh failed' }]),
      false
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
      JSON.stringify([{ account: 'A', reason: 'Token refresh failed' }]),
      false
    ])
  })

  it('redacts provider credentials before persisting a failed account result', async () => {
    const { recordSyncJobAccountResult } = await import('~~/server/utils/spendSyncJobs')

    await recordSyncJobAccountResult('job-1', {
      synced: 0,
      totalSpend: 0,
      failures: [{
        account: 'A',
        reason: 'https://graph.facebook.com/insights?access_token=provider-secret&limit=500',
      }],
    })

    const persisted = String(mockQueryOne.mock.calls[0]![1][3])
    expect(persisted).toContain('access_token=[redacted]')
    expect(persisted).not.toContain('provider-secret')
  })
})
