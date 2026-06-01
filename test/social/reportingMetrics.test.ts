import { describe, it, expect, vi } from 'vitest'
import {
  insightsToMap, mapFbPostInsights, mapIgMediaInsights, mapFbAccountInsights, mapIgAccountInsights,
} from '~~/server/utils/socialReporting/normalize'
import { upsertPostMetric, upsertAccountMetric } from '~~/server/utils/socialReporting/store'

describe('insightsToMap', () => {
  it('takes the last value from a values[] series', () => {
    const m = insightsToMap({ data: [{ name: 'reach', values: [{ value: 10 }, { value: 25 }] }] })
    expect(m.reach).toBe(25)
  })
  it('reads total_value.value when present', () => {
    expect(insightsToMap({ data: [{ name: 'clicks', total_value: { value: 7 } }] }).clicks).toBe(7)
  })
  it('sums an object-valued metric (e.g. reactions-by-type)', () => {
    const m = insightsToMap({ data: [{ name: 'post_reactions_by_type_total', values: [{ value: { like: 3, love: 2, wow: 1 } }] }] })
    expect(m.post_reactions_by_type_total).toBe(6)
  })
  it('is robust to junk (non-array data, missing names, non-numeric)', () => {
    expect(insightsToMap(null)).toEqual({})
    expect(insightsToMap({ data: [{ values: [{ value: 1 }] }, { name: 'x', values: [{ value: 'NaN' }] }] })).toEqual({ x: 0 })
  })
})

describe('post insight mappers', () => {
  it('maps FB post insights + merges comments/shares + computes engagements', () => {
    const data = { data: [
      { name: 'post_impressions', values: [{ value: 1000 }] },
      { name: 'post_impressions_unique', values: [{ value: 800 }] },
      { name: 'post_clicks', values: [{ value: 40 }] },
      { name: 'post_reactions_by_type_total', values: [{ value: { like: 20, love: 5 } }] },
    ] }
    const pm = mapFbPostInsights('p1', 'fbpost_1', data, { comments: 8, shares: 3 })
    expect(pm).toMatchObject({ postId: 'p1', platformPostId: 'fbpost_1', impressions: 1000, reach: 800, clicks: 40, reactions: 25, commentsCount: 8, shares: 3 })
    expect(pm.engagements).toBe(25 + 8 + 3 + 40)
  })
  it('maps IG media insights + computes engagements', () => {
    const data = { data: [
      { name: 'impressions', values: [{ value: 500 }] },
      { name: 'reach', values: [{ value: 450 }] },
      { name: 'likes', values: [{ value: 60 }] },
      { name: 'comments', values: [{ value: 10 }] },
      { name: 'saved', values: [{ value: 5 }] },
      { name: 'shares', values: [{ value: 2 }] },
    ] }
    const pm = mapIgMediaInsights('p2', 'igmedia_1', data)
    expect(pm).toMatchObject({ impressions: 500, reach: 450, likes: 60, commentsCount: 10, saves: 5, shares: 2 })
    expect(pm.engagements).toBe(60 + 10 + 2 + 5)
  })
})

describe('account insight mappers', () => {
  it('FB account: fan_count → followers + page insights', () => {
    const m = mapFbAccountInsights({ data: [{ name: 'page_impressions', values: [{ value: 9000 }] }, { name: 'page_impressions_unique', values: [{ value: 7000 }] }] }, 1234)
    expect(m).toMatchObject({ followers: 1234, impressions: 9000, reach: 7000 })
  })
  it('IG account: followers_count → followers + insights', () => {
    const m = mapIgAccountInsights({ data: [{ name: 'reach', values: [{ value: 3000 }] }, { name: 'profile_views', values: [{ value: 120 }] }] }, 5678)
    expect(m).toMatchObject({ followers: 5678, reach: 3000, profileViews: 120 })
  })
})

describe('store upserts (idempotent latest-snapshot)', () => {
  it('upsertPostMetric overwrites on (post_id, platform) conflict', async () => {
    let sql = ''
    const db = { execute: vi.fn(async (s: string) => { sql = s; return 1 }) }
    await upsertPostMetric(db as any, 'facebook', { postId: 'p1', platformPostId: 'x', impressions: 100, reach: 80 })
    expect(sql).toMatch(/INSERT INTO social_post_metrics/i)
    expect(sql).toMatch(/ON CONFLICT \(post_id, platform\) DO UPDATE/i)
  })
  it('upsertAccountMetric overwrites on (account, day) conflict', async () => {
    let sql = ''; let params: any[] = []
    const db = { execute: vi.fn(async (s: string, p: any[]) => { sql = s; params = p; return 1 }) }
    await upsertAccountMetric(db as any, {
      clientId: 'c1', accountId: 'a1', platform: 'instagram', snapshotDate: '2026-06-02', metric: { followers: 999 },
    })
    expect(sql).toMatch(/INSERT INTO social_account_metrics/i)
    expect(sql).toMatch(/ON CONFLICT \(social_account_id, snapshot_date\) DO UPDATE/i)
    expect(params.slice(0, 5)).toEqual(['c1', 'a1', 'instagram', '2026-06-02', 999])
  })
})
