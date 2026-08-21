import { describe, it, expect, vi } from 'vitest'
import { getAdspendPacing, type AdspendDeps, type PacingCampaign } from '~~/server/utils/ai/tools/adspend'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }
// Fixtures sync at 2026-08-18T08:15Z; pin the clock so the P-02 halt never trips by accident.
const NOW = () => new Date('2026-08-18T12:00:00Z')

function campaign(p: Partial<PacingCampaign>): PacingCampaign {
  return {
    client: 'Acme',
    platform: 'meta',
    spend: 500,
    budget: 1000,
    pacePct: 50,
    status: 'overpacing',
    budgetLevel: 'campaign',
    unattributed: false,
    lastSyncedAt: '2026-08-18T08:15:00Z',
    ...p,
  }
}

describe('get_adspend_pacing', () => {
  it('filters to underpacing campaigns when status=underpacing', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'Under Co', pacePct: 30, status: 'underpacing' }),
        campaign({ client: 'Over Co', pacePct: 130, status: 'overpacing' }),
        campaign({ client: 'On Co', pacePct: 100, status: 'on_pace' }),
      ]),
    }
    const res = await getAdspendPacing({ status: 'underpacing' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.campaigns).toHaveLength(1)
    expect(data.campaigns[0].client).toBe('Under Co')
    expect(data.campaigns[0].status).toBe('underpacing')
  })

  it('returns the compact per-campaign projection', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'Acme', platform: 'google', spend: 1200, budget: 2000, pacePct: 60, status: 'underpacing' }),
      ]),
    }
    const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
    expect(res.ok).toBe(true)
    const c = (res as any).data.campaigns[0]
    expect(c).toMatchObject({ client: 'Acme', platform: 'google', spend: 1200, budget: 2000, pacePct: 60, status: 'underpacing', budgetLevel: 'client' })
  })

  it('reports the oldest sync and every stale or missing source row', async () => {
    const deps: AdspendDeps = {
      now: () => new Date('2026-08-19T12:00:00Z'),
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'Fresh', lastSyncedAt: '2026-08-18T08:15:00Z' }),
        campaign({ client: 'Stale', lastSyncedAt: '2026-08-15T08:15:00Z' }),
        campaign({ client: 'Missing', lastSyncedAt: null }),
      ]),
    }
    const data = (await getAdspendPacing({ status: 'all' }, ctx, deps) as any).data
    // 27h45m since the newest sync: the tool halts (P-02) and the freshness summary moves under asOf.
    expect(data.halted).toBe(true)
    expect(data.asOf).toMatchObject({
      lastSyncedAt: '2026-08-18T08:15:00Z',
      oldestSyncedAt: '2026-08-15T08:15:00Z',
      staleRowCount: 2,
      stalenessThresholdHours: 48,
    })
  })

  it('caps the campaign list at 20 and reports a `more` count', async () => {
    const many = Array.from({ length: 27 }, (_, i) =>
      campaign({ client: `C${i}`, status: 'overpacing', pacePct: 120 }),
    )
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null, pacing: vi.fn().mockResolvedValue(many) }
    const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.campaigns).toHaveLength(20)
    expect(data.more).toBe(7)
    expect(data.total).toBe(27)
    expect(data.nextCursor).toBeTruthy()

    const page2 = await getAdspendPacing({ status: 'all', cursor: data.nextCursor }, ctx, deps)
    expect((page2 as any).data.campaigns).toHaveLength(7)
    expect((page2 as any).data.nextCursor).toBeNull()
  })

  it('never classifies spend without a budget as underpacing', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'No Budget Co', spend: 1453.56, budget: null, pacePct: null, status: 'no_budget_set' }),
      ]),
    }
    const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
    const data = (res as any).data
    expect(data.campaigns[0]).toMatchObject({ budget: null, pacePct: null, status: 'no_budget_set' })
    expect(data.dataStatus).toBe('partial')
    expect(data.coverage).toEqual({ expected: 1, withData: 0 })
  })

  it('does not classify client pacing when only some campaign budgets are configured', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({
          client: 'Northern Motor Group', spend: 1705.22, budget: 510, pacePct: 576,
          status: 'overpacing', campaignCount: 13, budgetedCampaignCount: 1,
        }),
      ]),
    }

    const data = (await getAdspendPacing({ status: 'all' }, ctx, deps) as any).data

    expect(data.campaigns[0]).toMatchObject({
      budgetLevel: 'client',
      status: 'partial_budget_coverage',
      pacePct: null,
      budgetCoverage: { expectedCampaigns: 13, budgetedCampaigns: 1 },
    })
    expect(data.coverage).toEqual({ expected: 1, withData: 0 })
    expect(data.excludedFromPacingCount).toBe(1)
  })

  it('separates unattributed account spend from client pacing rows', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'Acme', spend: 100 }),
        campaign({ client: 'Knox GWM', platform: 'google', spend: 1586.53, budget: null, pacePct: null, status: 'no_budget_set', unattributed: true }),
      ]),
    }
    const data = (await getAdspendPacing({ status: 'all' }, ctx, deps) as any).data
    expect(data.campaigns.map((c: any) => c.client)).toEqual(['Acme'])
    expect(data.unattributed).toEqual([
      expect.objectContaining({ accountName: 'Knox GWM', platform: 'google', spend: 1586.53, unattributed: true }),
    ])
  })

  it('applies optional clientName and platform filters', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'Acme', platform: 'meta' }),
        campaign({ client: 'Acme', platform: 'google' }),
        campaign({ client: 'Globex', platform: 'meta' }),
      ]),
    }
    const res = await getAdspendPacing({ clientName: 'acme', platform: 'meta', status: 'all' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.campaigns).toHaveLength(1)
    expect(data.campaigns[0].client).toBe('Acme')
    expect(data.campaigns[0].platform).toBe('meta')
  })

  it('returns a recoverable error (never throws) when the source rejects', async () => {
    const deps: AdspendDeps = {
      now: NOW,
      loadCoverageDeltas: async () => null,
      pacing: vi.fn().mockRejectedValue(new Error('spend api down')),
    }
    const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/spend|pacing/i)
  })

  describe('P-02 halt — says so and stops', () => {
    it('withholds every figure and names the reason before the newest sync reaches 24h old', async () => {
      const deps: AdspendDeps = {
        now: () => new Date('2026-08-19T10:16:00Z'),
        loadCoverageDeltas: async () => null,
        pacing: vi.fn().mockResolvedValue([
          campaign({ client: 'Acme', spend: 4721.16, budget: 510, lastSyncedAt: '2026-08-18T08:15:00Z' }),
          campaign({ client: 'Beta', spend: 900, budget: 1000, lastSyncedAt: '2026-08-18T08:15:00Z' }),
        ]),
      }
      const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
      expect(res.ok).toBe(true)
      const data = (res as any).data
      expect(data.halted).toBe(true)
      expect(data.haltReason).toBe('stale_sync')
      expect(data.haltDetail).toMatch(/23\.5h/)
      expect(data.asOf.lastSyncedAt).toBe('2026-08-18T08:15:00Z')
      expect(data.campaigns).toEqual([])
      expect(data.unattributed).toEqual([])
      expect(data.total).toBe(0)
      expect(JSON.stringify(data)).not.toContain('4721.16')
      // The universe stays visible so a consumer can still see what is NOT being assessed (P-13).
      expect(data.coverage).toEqual({ expected: 2, withData: 2 })
    })

    it('halts on a coverage drop even when the sync is fresh', async () => {
      const deps: AdspendDeps = {
        now: NOW,
        loadCoverageDeltas: async () => ({ meta: { deltaPct: -40 } }),
        pacing: vi.fn().mockResolvedValue([campaign({ client: 'Acme' })]),
      }
      const data = ((await getAdspendPacing({ status: 'all' }, ctx, deps)) as any).data
      expect(data.halted).toBe(true)
      expect(data.haltReason).toBe('coverage_drop')
      expect(data.campaigns).toEqual([])
    })

    it('does not halt inside the window and reports halted:false explicitly', async () => {
      const deps: AdspendDeps = {
        now: () => new Date('2026-08-19T07:00:00Z'),
        loadCoverageDeltas: async () => null,
        pacing: vi.fn().mockResolvedValue([campaign({ client: 'Acme' })]),
      }
      const data = ((await getAdspendPacing({ status: 'all' }, ctx, deps)) as any).data
      expect(data.halted).toBe(false)
      expect(data.campaigns).toHaveLength(1)
    })
  })
})
