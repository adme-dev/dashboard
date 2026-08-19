import { describe, it, expect, vi } from 'vitest'
import { getAdspendPacing, type AdspendDeps, type PacingCampaign } from '~~/server/utils/ai/tools/adspend'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

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
      pacing: vi.fn().mockResolvedValue([
        campaign({ client: 'Acme', platform: 'google', spend: 1200, budget: 2000, pacePct: 60, status: 'underpacing' }),
      ]),
    }
    const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
    expect(res.ok).toBe(true)
    const c = (res as any).data.campaigns[0]
    expect(c).toMatchObject({ client: 'Acme', platform: 'google', spend: 1200, budget: 2000, pacePct: 60, status: 'underpacing', budgetLevel: 'client' })
  })

  it('caps the campaign list at 20 and reports a `more` count', async () => {
    const many = Array.from({ length: 27 }, (_, i) =>
      campaign({ client: `C${i}`, status: 'overpacing', pacePct: 120 }),
    )
    const deps: AdspendDeps = { pacing: vi.fn().mockResolvedValue(many) }
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
      pacing: vi.fn().mockRejectedValue(new Error('spend api down')),
    }
    const res = await getAdspendPacing({ status: 'all' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/spend|pacing/i)
  })
})
