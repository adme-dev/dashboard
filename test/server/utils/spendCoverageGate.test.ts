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

import {
  SPEND_SYNC_COVERAGE_HALT_PCT,
  evaluateSpendCoverageGate,
  applySpendCoverageGate,
  getSpendCoverageDeltas
} from '~~/server/utils/spendSyncJobs'

describe('evaluateSpendCoverageGate (G-2 halt threshold)', () => {
  it('proceeds with null delta when there is no previous baseline', () => {
    expect(evaluateSpendCoverageGate(null, 50)).toEqual({ previousCount: null, currentCount: 50, delta: null, deltaPct: null, action: 'proceed' })
    expect(evaluateSpendCoverageGate(0, 50)).toMatchObject({ action: 'proceed', deltaPct: null })
  })

  it('proceeds on equal or increased coverage', () => {
    expect(evaluateSpendCoverageGate(70, 88)).toMatchObject({ action: 'proceed', delta: 18, deltaPct: 25.71 })
    expect(evaluateSpendCoverageGate(88, 88)).toMatchObject({ action: 'proceed', delta: 0 })
  })

  it('warns on a decrease at or below the halt threshold and halts beyond it', () => {
    expect(SPEND_SYNC_COVERAGE_HALT_PCT).toBe(5)
    expect(evaluateSpendCoverageGate(100, 95)).toMatchObject({ action: 'warn', delta: -5, deltaPct: -5 })
    expect(evaluateSpendCoverageGate(100, 94)).toMatchObject({ action: 'halt', delta: -6, deltaPct: -6 })
    // The 19 Aug shape: 88 known campaigns, source silently returns 70.
    expect(evaluateSpendCoverageGate(88, 70)).toMatchObject({ action: 'halt', delta: -18 })
  })
})

describe('applySpendCoverageGate (no-persist halt behaviour)', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockCreateBulkNotifications.mockReset()
  })

  const input = (currentCount: number) => ({ platform: 'meta', sourceKey: 'conn-1', sourceLabel: 'Peter Davey Suzuki', currentCount })

  it('halts, notifies owners, and returns a structured warning on a >5% drop', async () => {
    const notifyHalt = vi.fn(async () => {})
    const result = await applySpendCoverageGate(input(70), { loadPrevious: async () => 88, notifyHalt })
    expect(result.halted).toBe(true)
    expect(result.gate.action).toBe('halt')
    expect(result.warning).toContain('Coverage halt')
    expect(result.warning).toContain('70')
    expect(result.warning).toContain('88')
    expect(notifyHalt).toHaveBeenCalledWith(expect.objectContaining({ platform: 'meta', sourceLabel: 'Peter Davey Suzuki' }))
  })

  it('warns without halting on a small decrease, and passes clean runs silently', async () => {
    const notifyHalt = vi.fn(async () => {})
    const warn = await applySpendCoverageGate(input(96), { loadPrevious: async () => 100, notifyHalt })
    expect(warn).toMatchObject({ halted: false })
    expect(warn.warning).toContain('Coverage decreased')
    expect(notifyHalt).not.toHaveBeenCalled()

    const clean = await applySpendCoverageGate(input(105), { loadPrevious: async () => 100, notifyHalt })
    expect(clean).toEqual({ gate: expect.objectContaining({ action: 'proceed' }), halted: false, warning: null })
  })

  it('never writes to the database while deciding (the persist step belongs to the caller)', async () => {
    await applySpendCoverageGate(input(70), { loadPrevious: async () => 88, notifyHalt: async () => {} })
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})

describe('meta sync halts its persist step on a coverage drop (no rows overwritten)', () => {
  it('returns synced 0 with a coverage-halt failure and touches no media_spend row', async () => {
    vi.resetModules()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()

    vi.doMock('~~/server/utils/metaClient', () => ({
      getCampaignInsights: vi.fn(async () => [
        { campaign_id: 'c1', campaign_name: 'One', spend: '10' },
        { campaign_id: 'c2', campaign_name: 'Two', spend: '20' }
      ]),
      getCampaignInsightsById: vi.fn(),
      getCampaignDailyInsights: vi.fn(async () => []),
      getCampaignDailyInsightsById: vi.fn(),
      getCampaigns: vi.fn(async () => []),
      mapMetaCampaignMeta: vi.fn(() => ({})),
      extractConversions: vi.fn(() => 0),
      extractRevenue: vi.fn(() => 0)
    }))
    const notifyHalt = vi.fn(async () => {})
    vi.doMock('~~/server/utils/spendSyncJobs', async (importOriginal) => {
      const original = await importOriginal<Record<string, unknown>>()
      return {
        ...original,
        // Real gate logic; only the baseline lookup and notification are injected.
        applySpendCoverageGate: (input: never) =>
          (original.applySpendCoverageGate as any)(input, { loadPrevious: async () => 88, notifyHalt }),
        recordSourceCampaignCount: vi.fn(async () => {})
      }
    })
    const { syncMetaSpendAccount } = await import('~~/server/utils/spendSync')

    mockQueryOne.mockResolvedValue(null) // connection client lookup etc.
    const result = await syncMetaSpendAccount(
      { id: 'conn-1', client_id: null, account_id: 'acc', account_name: 'Peter Davey Suzuki', access_token: 't', metadata: {} } as never,
      8, 2026, []
    )

    expect(result.synced).toBe(0)
    expect(result.failures).toEqual([expect.objectContaining({ reason: expect.stringContaining('Coverage halt') })])
    expect(result.coverageWarnings?.[0]).toContain('Coverage halt')
    expect(notifyHalt).toHaveBeenCalled()
    // The persist step never ran: no media_spend SELECT/UPDATE/INSERT was issued after the gate.
    const persistCalls = [...mockQueryOne.mock.calls, ...mockExecute.mock.calls]
      .filter(call => String(call[0]).includes('media_spend'))
    expect(persistCalls).toEqual([])

    vi.doUnmock('~~/server/utils/metaClient')
    vi.doUnmock('~~/server/utils/spendSyncJobs')
    vi.resetModules()
  })
})

describe('getSpendCoverageDeltas (coverageDelta shaping for the read tools)', () => {
  it('shapes previous/current counts and delta per platform from the last two completed jobs', async () => {
    const load = vi.fn(async () => [
      { platform: 'meta', synced_count: 88, finished_at: '2026-08-19T10:00:00Z', rank: 1 },
      { platform: 'meta', synced_count: 70, finished_at: '2026-08-18T10:00:00Z', rank: 2 },
      { platform: 'google', synced_count: 40, finished_at: '2026-08-19T09:00:00Z', rank: 1 }
    ])
    const deltas = await getSpendCoverageDeltas(load as never, new Date('2026-08-19T12:00:00Z'))
    expect(deltas).toEqual({
      meta: {
        previousCount: 70,
        currentCount: 88,
        delta: 18,
        deltaPct: 25.71,
        previousFinishedAt: '2026-08-18T10:00:00Z',
        currentFinishedAt: '2026-08-19T10:00:00Z',
        staleBaseline: false,
        previousComparable: true
      },
      google: {
        previousCount: null,
        currentCount: 40,
        delta: null,
        deltaPct: null,
        previousFinishedAt: null,
        currentFinishedAt: '2026-08-19T09:00:00Z',
        // A single fresh run is a usable baseline: delta is null (no comparison) but not stale.
        staleBaseline: false,
        previousComparable: false
      }
    })
  })

  it('BF-2 follow-up: staleness is measured against now, so one fresh run after a June-vintage run clears the halt', async () => {
    const now = new Date('2026-08-22T12:00:00Z')
    const juneOnly = vi.fn(async () => [
      { platform: 'meta', synced_count: 100, finished_at: '2026-06-29T11:22:21Z', rank: 1 },
      { platform: 'meta', synced_count: 99, finished_at: '2026-06-25T01:55:14Z', rank: 2 }
    ])
    expect((await getSpendCoverageDeltas(juneOnly as never, now))!.meta.staleBaseline).toBe(true)

    const freshAfterJune = vi.fn(async () => [
      { platform: 'meta', synced_count: 90, finished_at: '2026-08-22T10:57:48Z', rank: 1 },
      { platform: 'meta', synced_count: 100, finished_at: '2026-06-29T11:22:21Z', rank: 2 }
    ])
    const meta = (await getSpendCoverageDeltas(freshAfterJune as never, now))!.meta
    expect(meta.staleBaseline).toBe(false)
    // The previous run is eight weeks old: the raw delta is reported, but deltaPct is null so the
    // coverage-drop halt does not fire on what is really campaign churn, not lost coverage.
    expect(meta.delta).toBe(-10)
    expect(meta.deltaPct).toBeNull()
    expect(meta.previousComparable).toBe(false)

    const consecutive = vi.fn(async () => [
      { platform: 'meta', synced_count: 90, finished_at: '2026-08-22T10:57:48Z', rank: 1 },
      { platform: 'meta', synced_count: 100, finished_at: '2026-08-21T10:57:48Z', rank: 2 }
    ])
    const consecutiveMeta = (await getSpendCoverageDeltas(consecutive as never, now))!.meta
    expect(consecutiveMeta.deltaPct).toBe(-10)
    expect(consecutiveMeta.previousComparable).toBe(true)

    const fortyNineHoursOld = vi.fn(async () => [
      { platform: 'meta', synced_count: 90, finished_at: '2026-08-20T10:59:00Z', rank: 1 }
    ])
    expect((await getSpendCoverageDeltas(fortyNineHoursOld as never, now))!.meta.staleBaseline).toBe(true)
  })

  it('returns null (omitting coverageDelta) when the job table is unavailable', async () => {
    expect(await getSpendCoverageDeltas(vi.fn(async () => { throw new Error('no db') }) as never)).toBeNull()
    expect(await getSpendCoverageDeltas(vi.fn(async () => []) as never)).toBeNull()
  })
})
