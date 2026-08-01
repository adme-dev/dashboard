import { describe, expect, it } from 'vitest'
import { buildSpendSyncWarning } from '../../app/utils/spendSyncStatus'
import type { SpendSyncJobStatus } from '../../app/types'

const job = (overrides: Partial<SpendSyncJobStatus> = {}): SpendSyncJobStatus => ({
  jobId: 'job-1',
  platform: 'google',
  period: '2026-08',
  status: 'completed',
  syncedCount: 30,
  totalSpend: 231.73,
  failures: [
    { account: 'Zulu Motors', reason: 'Access denied (403)' },
    { account: 'Alpha Motors', reason: 'Access denied (403)' },
    { account: 'Alpha Motors', reason: 'Access denied (403)' }
  ],
  error: null,
  startedAt: '2026-08-01T03:19:22.000Z',
  finishedAt: '2026-08-01T03:21:24.000Z',
  totalAccounts: 108,
  processedAccounts: 108,
  ...overrides
})

describe('buildSpendSyncWarning', () => {
  it('counts unique failed accounts and groups them alphabetically by reason', () => {
    const warning = buildSpendSyncWarning(job(), 'Google Ads')

    expect(warning).toMatchObject({
      title: 'Partial Google Ads data',
      failedAccounts: 2,
      completedAccounts: 106,
      totalAccounts: 108
    })
    expect(warning?.summary).toContain('106 of 108 accounts synced')
    expect(warning?.summary).toContain('incomplete or stale for 2 accounts')
    expect(warning?.groups).toEqual([{
      reason: 'Access denied (403)',
      accounts: ['Alpha Motors', 'Zulu Motors']
    }])
  })

  it('returns null for a newer clean completed job or a running job', () => {
    expect(buildSpendSyncWarning(job({ failures: [] }), 'Google Ads')).toBeNull()
    expect(buildSpendSyncWarning(job({ status: 'running' }), 'Google Ads')).toBeNull()
  })

  it('surfaces a terminal job failure without account details', () => {
    const warning = buildSpendSyncWarning(job({
      status: 'failed',
      failures: [],
      error: 'Queue unavailable'
    }), 'Google Ads')

    expect(warning).toMatchObject({
      title: 'Google Ads sync failed',
      summary: 'Queue unavailable'
    })
  })
})
