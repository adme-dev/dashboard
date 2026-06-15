import { describe, it, expect, vi, beforeEach } from 'vitest'

const sends: any[] = []
const queue = { send: vi.fn(async (m: any) => { sends.push(m) }) }
vi.mock('~~/server/utils/queue', () => ({ getQueue: () => queue }))
vi.mock('~~/server/utils/spendSync', () => ({
  listMetaConnectionIds: async () => ['m1', 'm2'],
  listGoogleConnectionIds: async () => ['g1', 'g2', 'g3'],
  syncMetaSpend: vi.fn(), syncGoogleSpend: vi.fn(), syncMicrosoftSpend: vi.fn(),
  syncPinterestSpend: vi.fn(), syncTikTokSpend: vi.fn(), syncLinkedinSpend: vi.fn(),
  syncSnapchatSpend: vi.fn(), syncTwitterSpend: vi.fn(),
}))
vi.mock('~~/server/utils/spendSyncJobs', () => ({
  createSpendSyncJob: vi.fn(async () => 'job-1'),
  setSyncJobTotalAccounts: vi.fn(),
}))
vi.mock('~~/server/utils/asyncBackground', () => ({ runSpendSyncInBackground: vi.fn() }))

import { startSpendSyncAllPlatforms } from '~~/server/utils/spendSyncKickoff'

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
})
