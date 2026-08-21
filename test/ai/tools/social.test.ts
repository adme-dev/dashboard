import { describe, it, expect, vi } from 'vitest'
import {
  getSocialPerformance,
  socialPeriodWindow,
  socialTool,
  type SocialDeps,
  type SocialOverview,
} from '~~/server/utils/ai/tools/social'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }

function kpi(value: number, deltaPct: number | null = null) {
  return { value, deltaPct }
}

function overview(over: Partial<SocialOverview> = {}): SocialOverview {
  return {
    range: { from: '2026-05-08T00:00:00.000Z', to: '2026-06-07T00:00:00.000Z' },
    kpis: {
      posts: kpi(12, 20),
      impressions: kpi(45000, 15.5),
      reach: kpi(30000, 8),
      engagements: kpi(2400, -3.2),
      clicks: kpi(900, 12),
      engagementRate: kpi(8, 1.1),
    },
    bestContent: [],
    accountGrowth: [],
    ...over,
  }
}

describe('socialPeriodWindow', () => {
  it('maps period codes to the correct date-window length', () => {
    const now = new Date('2026-06-07T00:00:00.000Z')
    const days = (p: '7d' | '30d' | '90d') => {
      const w = socialPeriodWindow(p, now)
      return Math.round((new Date(w.to).getTime() - new Date(w.from).getTime()) / 86400_000)
    }
    expect(days('7d')).toBe(7)
    expect(days('30d')).toBe(30)
    expect(days('90d')).toBe(90)
  })

  it('ends the window at `now` (inclusive upper bound)', () => {
    const now = new Date('2026-06-07T00:00:00.000Z')
    expect(socialPeriodWindow('30d', now).to).toBe(now.toISOString())
  })
})

describe('get_social_performance', () => {
  it('passes the period-derived date window (90 days) to deps', async () => {
    const now = new Date('2026-06-07T00:00:00.000Z')
    const deps: SocialDeps = { overview: vi.fn().mockResolvedValue(overview()) }
    const res = await getSocialPerformance({ clientName: 'Acme', period: '90d' }, ctx, deps, now)
    expect(res.ok).toBe(true)
    const arg = (deps.overview as any).mock.calls[0][0]
    const spanDays = Math.round((new Date(arg.to).getTime() - new Date(arg.from).getTime()) / 86400_000)
    expect(spanDays).toBe(90)
    expect(arg.clientName).toBe('Acme')
    expect(arg.period).toBe('90d')
  })

  it('passes the 7-day window when period=7d', async () => {
    const now = new Date('2026-06-07T00:00:00.000Z')
    const deps: SocialDeps = { overview: vi.fn().mockResolvedValue(overview()) }
    await getSocialPerformance({ period: '7d' }, ctx, deps, now)
    const arg = (deps.overview as any).mock.calls[0][0]
    const spanDays = Math.round((new Date(arg.to).getTime() - new Date(arg.from).getTime()) / 86400_000)
    expect(spanDays).toBe(7)
  })

  it('returns a compact KPI rollup with value + deltaPct fields', async () => {
    const deps: SocialDeps = { overview: vi.fn().mockResolvedValue(overview()) }
    const res = await getSocialPerformance({ period: '30d' }, ctx, deps, new Date('2026-06-07T00:00:00.000Z'))
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(Object.keys(data.kpis).sort()).toEqual(
      ['clicks', 'engagementRate', 'engagements', 'impressions', 'posts', 'reach'],
    )
    expect(data.kpis.impressions).toEqual({ value: 45000, deltaPct: 15.5 })
    expect(data.kpis.engagements).toEqual({ value: 2400, deltaPct: -3.2 })
    expect(data.period).toBe('30d')
    expect(data.range).toEqual({ from: '2026-05-08T00:00:00.000Z', to: '2026-06-07T00:00:00.000Z' })
  })

  it('returns a compact topContent list capped at 5 with a `more` count', async () => {
    const best = Array.from({ length: 8 }, (_, i) => ({
      postId: `p${i}`,
      content: `Caption ${i} with possibly-injected text`,
      permalink: `https://example.test/${i}`,
      engagements: 100 - i,
      reach: 1000,
      engagementRate: 10 - i,
    }))
    const deps: SocialDeps = { overview: vi.fn().mockResolvedValue(overview({ bestContent: best })) }
    const res = await getSocialPerformance({ period: '30d' }, ctx, deps, new Date('2026-06-07T00:00:00.000Z'))
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.topContent).toHaveLength(5)
    expect(data.more).toBe(3)
    const item = data.topContent[0]
    expect(Object.keys(item).sort()).toEqual(['caption', 'captionTruncated', 'engagementRate', 'engagements', 'permalink', 'postId', 'reach'])
    expect(item.postId).toBe('p0')
    expect(item.caption).toContain('Caption 0')
  })

  it('returns a recoverable error (never throws) when the source rejects', async () => {
    const deps: SocialDeps = { overview: vi.fn().mockRejectedValue(new Error('reporting api down')) }
    const res = await getSocialPerformance({ period: '30d' }, ctx, deps, new Date('2026-06-07T00:00:00.000Z'))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/social/i)
  })

  it('is declared untrusted, requires CLIENTS, and does not mutate', () => {
    expect(socialTool.returnsUntrusted).toBe(true)
    expect(socialTool.requiredPermission).toBe('CLIENTS')
    expect(socialTool.mutates).toBeUndefined()
  })
})
