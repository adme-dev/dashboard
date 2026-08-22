import { describe, it, expect, vi, beforeEach } from 'vitest'

import { startSpendSyncAllPlatforms, startSpendSyncPlatform } from '~~/server/utils/spendSyncKickoff'
import * as queueModule from '~~/server/utils/queue'

const sends: any[] = []
const queue = { send: vi.fn(async (m: any) => { sends.push(m) }) }
vi.mock('~~/server/utils/queue', () => ({ getQueue: () => queue }))
vi.mock('~~/server/utils/spendSync', () => ({
  listMetaConnectionIds: async () => ['m1', 'm2'],
  listGoogleConnectionIds: async () => ['g1', 'g2', 'g3'],
  syncMetaSpend: vi.fn(), syncGoogleSpend: vi.fn(), syncMicrosoftSpend: vi.fn(),
  syncPinterestSpend: vi.fn(), syncTikTokSpend: vi.fn(), syncLinkedinSpend: vi.fn(),
  syncSnapchatSpend: vi.fn(), syncTwitterSpend: vi.fn()
}))
const reaped = vi.fn(async () => [] as string[])
vi.mock('~~/server/utils/spendSyncJobs', () => ({
  createSpendSyncJob: vi.fn(async () => 'job-1'),
  setSyncJobTotalAccounts: vi.fn(),
  completeSpendSyncJob: vi.fn(),
  failSpendSyncJob: vi.fn(),
  reapOrphanedSpendSyncJobs: (...args: unknown[]) => reaped(...args)
}))
const runInBackground = vi.fn()
vi.mock('~~/server/utils/asyncBackground', () => ({ runSpendSyncInBackground: (...args: unknown[]) => runInBackground(...args) }))

beforeEach(() => { sends.length = 0; queue.send.mockClear() })

describe('startSpendSyncAllPlatforms — Google fan-out', () => {
  it('enqueues one spend.sync.google.account message per Google connection', async () => {
    const event = { context: {} } as any
    await startSpendSyncAllPlatforms(event, 6, 2026)
    const googleMsgs = sends.filter(m => m.type === 'spend.sync.google.account')
    expect(googleMsgs.map(m => m.payload.connectionId)).toEqual(['g1', 'g2', 'g3'])
    expect(googleMsgs.every(m => m.payload.jobId === 'job-1' && m.payload.month === 6 && m.payload.year === 2026)).toBe(true)
  })

  it('still fans Meta out per account', async () => {
    const event = { context: {} } as any
    await startSpendSyncAllPlatforms(event, 6, 2026)
    const metaMsgs = sends.filter(m => m.type === 'spend.sync.meta.account')
    expect(metaMsgs.map(m => m.payload.connectionId)).toEqual(['m1', 'm2'])
  })

  describe('startSpendSyncPlatform (shared by HTTP endpoints + run_adspend_sync)', () => {
    beforeEach(() => { reaped.mockClear(); runInBackground.mockClear() })

    it('reaps orphaned running jobs first, then fans out per account via the queue', async () => {
      reaped.mockResolvedValueOnce(['ghost-1'])
      const result = await startSpendSyncPlatform({ context: {} } as any, 'google', 8, 2026, 'user-1')
      expect(reaped).toHaveBeenCalledWith('google')
      expect(result).toMatchObject({ status: 'started', jobId: 'job-1', queued: true, accounts: 3, reapedJobIds: ['ghost-1'] })
      expect(sends.filter(m => m.type === 'spend.sync.google.account')).toHaveLength(3)
      expect(runInBackground).not.toHaveBeenCalled()
    })

    it('reports queued:false when the event carries no JOBS_QUEUE binding (inline fallback)', async () => {
      const spy = vi.spyOn(queueModule, 'getQueue').mockReturnValueOnce(null)
      const result = await startSpendSyncPlatform({ context: {} } as any, 'meta', 8, 2026, null)
      spy.mockRestore()
      expect(result).toMatchObject({ queued: false, accounts: 0 })
      expect(runInBackground).toHaveBeenCalledTimes(1)
      expect(sends).toHaveLength(0)
    })
  })
})
