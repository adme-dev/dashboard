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
    expect(Object.keys(c).sort()).toEqual(['budget', 'client', 'pacePct', 'platform', 'spend', 'status'])
    expect(c).toEqual({ client: 'Acme', platform: 'google', spend: 1200, budget: 2000, pacePct: 60, status: 'underpacing' })
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
