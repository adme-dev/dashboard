import { describe, it, expect } from 'vitest'
import {
  socialPctDelta, engagementRate, rollupPostMetrics, rankBestContent, cadenceByWeekday, buildOverview,
  type PostMetricRow,
} from '~~/server/utils/socialReporting/aggregate'
import { buildSummaryPrompt } from '~~/server/utils/socialReporting/aiSummary'

const row = (over: Partial<PostMetricRow>): PostMetricRow => ({
  post_id: 'p', platform: 'facebook', impressions: 0, reach: 0, engagements: 0, clicks: 0,
  likes: 0, comments_count: 0, shares: 0, saves: 0, video_views: 0, reactions: 0, ...over,
})

describe('socialPctDelta', () => {
  it('computes 1-decimal percentage change', () => {
    expect(socialPctDelta(120, 100)).toBe(20)
    expect(socialPctDelta(75, 100)).toBe(-25)
  })
  it('returns null with no baseline (avoids divide-by-zero/∞)', () => {
    expect(socialPctDelta(50, 0)).toBeNull()
  })
})

describe('engagementRate', () => {
  it('normalizes on reach, falls back to impressions, 0 when no denominator', () => {
    expect(engagementRate(50, 1000)).toBe(5)
    expect(engagementRate(50, 0, 2000)).toBe(2.5)
    expect(engagementRate(50, 0, 0)).toBe(0)
  })
  it('does not calculate a rate from unavailable measurements', () => {
    expect(engagementRate(null, 100, 100)).toBeNull()
    expect(engagementRate(0, null, null)).toBeNull()
    expect(engagementRate(0, 100, null)).toBe(0)
  })
})

describe('rollupPostMetrics', () => {
  it('sums across rows and counts posts', () => {
    const t = rollupPostMetrics([row({ impressions: 100, engagements: 10, comments_count: 2 }), row({ impressions: 50, engagements: 5, comments_count: 3 })])
    expect(t.impressions).toBe(150)
    expect(t.engagements).toBe(15)
    expect(t.comments).toBe(5)
    expect(t.posts).toBe(2)
  })
  it('keeps totals unavailable when any included post lacks the metric', () => {
    const totals = rollupPostMetrics([row({ impressions: null, likes: 0 }), row({ impressions: 100, likes: 2 })])
    expect(totals.impressions).toBeNull()
    expect(totals.likes).toBe(2)
    expect(totals.posts).toBe(2)
  })
  it('keeps an empty period distinct from measured zeroes', () => {
    expect(rollupPostMetrics([])).toMatchObject({ posts: 0, impressions: null, engagements: null })
    expect(rollupPostMetrics([row({})])).toMatchObject({ posts: 1, impressions: 0, engagements: 0 })
  })
})

describe('rankBestContent', () => {
  it('orders by engagement rate, tie-broken by raw engagements, caps to n', () => {
    const rows = [
      row({ post_id: 'a', reach: 1000, engagements: 100 }), // 10%
      row({ post_id: 'b', reach: 100, engagements: 50 }),   // 50%
      row({ post_id: 'c', reach: 1000, engagements: 200 }), // 20%
    ]
    const top = rankBestContent(rows, 2)
    expect(top.map(r => r.post_id)).toEqual(['b', 'c'])
    expect(top[0]!.engagementRate).toBe(50)
  })
})

describe('cadenceByWeekday', () => {
  it('buckets posts + avg engagement by UTC weekday, ignoring undated rows', () => {
    const c = cadenceByWeekday([
      row({ published_at: '2026-06-01T10:00:00Z', engagements: 10 }), // Mon (1)
      row({ published_at: '2026-06-01T12:00:00Z', engagements: 20 }), // Mon (1)
      row({ published_at: null, engagements: 999 }),                  // ignored
    ])
    expect(c).toHaveLength(7)
    expect(c[1]).toEqual({ weekday: 1, posts: 2, avgEngagements: 15 })
    expect(c[0]).toEqual({ weekday: 0, posts: 0, avgEngagements: 0 })
  })
  it('does not lower average engagement by treating missing values as zero', () => {
    const cadence = cadenceByWeekday([
      row({ published_at: '2026-06-01T10:00:00Z', engagements: null }),
      row({ published_at: '2026-06-01T12:00:00Z', engagements: 20 }),
    ])
    expect(cadence[1]).toEqual({ weekday: 1, posts: 2, avgEngagements: null })
  })
})

describe('buildOverview', () => {
  it('produces KPIs with deltas vs the prior period', () => {
    const ov = buildOverview(
      [row({ impressions: 200, reach: 100, engagements: 20 })],
      [row({ impressions: 100, reach: 100, engagements: 10 })],
    )
    expect(ov.impressions).toEqual({ value: 200, deltaPct: 100 })
    expect(ov.posts).toEqual({ value: 1, deltaPct: 0 })
    expect(ov.engagementRate.value).toBe(20) // 20/100
    expect(ov.engagementRate.deltaPct).toBe(100) // 20% vs 10%
  })
  it('does not claim a drop when current or prior provider data is unavailable', () => {
    const overview = buildOverview([row({ impressions: null, engagements: null, reach: null })], [row({ impressions: 100, engagements: 20, reach: 50 })])
    expect(overview.impressions).toEqual({ value: null, deltaPct: null })
    expect(overview.engagementRate).toEqual({ value: null, deltaPct: null })
    expect(socialPctDelta(100, null)).toBeNull()
    expect(socialPctDelta(null, 100)).toBeNull()
    expect(socialPctDelta(0, 100)).toBe(-100)
  })
})

describe('buildSummaryPrompt', () => {
  const k = {
    posts: { value: 12, deltaPct: 20 }, impressions: { value: 5000, deltaPct: 10 },
    reach: { value: 4000, deltaPct: -5 }, engagements: { value: 300, deltaPct: 23 },
    clicks: { value: 80, deltaPct: null }, engagementRate: { value: 7.5, deltaPct: 12 },
  }
  it('embeds metrics + deltas and renders "no prior baseline" for null deltas', () => {
    const p = buildSummaryPrompt('Acme', 'May 2026', k)
    expect(p).toContain('Acme')
    expect(p).toContain('May 2026')
    expect(p).toContain('Engagements: 300 (+23% vs prior)')
    expect(p).toContain('Reach: 4000 (-5% vs prior)')
    expect(p).toContain('Link clicks: 80 (no prior baseline)')
    expect(p).toContain('Do not invent numbers')
  })
})
