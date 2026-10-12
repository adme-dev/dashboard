import { afterEach, describe, expect, it, vi } from 'vitest'
import { facebookProvider } from '~~/server/utils/social-providers/facebook'
import { mapFbPostInsights } from '~~/server/utils/socialReporting/normalize'
import { upsertAccountMetric, upsertPostMetric } from '~~/server/utils/socialReporting/store'

const params = { accountId: 'page', accessToken: 'secret-token' }
const posts = [{ postId: 'p1', platformPostId: 'page_post1' }]
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

describe('Facebook metrics availability', () => {
  it('collects actual followers rather than Page likes and preserves missing insights', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/insights')
      ? json({ data: [] }) : json({ followers_count: 0, fan_count: 14 })))
    const metric = await facebookProvider.fetchAccountMetrics!(params)
    expect(metric).toMatchObject({ followers: 0 })
    expect(metric.impressions).toBeUndefined()
    expect(metric.reach).toBeUndefined()
    expect(metric.profileViews).toBeUndefined()
  })

  it('rejects failed account responses without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 190, message: 'secret-token expired' } }, 400)))
    await expect(facebookProvider.fetchAccountMetrics!(params)).rejects.toThrow(/Facebook/)
    await expect(facebookProvider.fetchAccountMetrics!(params)).rejects.not.toThrow('secret-token')
  })

  it('collects post field counts while missing metrics stay unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/insights') ? json({ data: [] }) : json({
      likes: { summary: { total_count: 2 } }, reactions: { summary: { total_count: 3 } },
      comments: { summary: { total_count: 0 } }
    })))
    const [metric] = await facebookProvider.fetchPostMetrics!({ ...params, posts })
    expect(metric).toMatchObject({ likes: 2, reactions: 3, commentsCount: 0 })
    expect(metric.shares).toBeUndefined()
    expect(metric.engagements).toBeUndefined()
    expect(metric.impressions).toBeUndefined()
  })

  it('does not emit successful zero snapshots when every request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 190 } }, 400)))
    await expect(facebookProvider.fetchPostMetrics!({ ...params, posts })).rejects.toThrow(/Facebook/)
  })

  it('keeps successful posts when another post cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('post1')
      ? json({ error: { code: 100 } }, 400)
      : input.includes('/insights') ? json({ data: [] }) : json({ comments: { summary: { total_count: 0 } } })))
    const metrics = await facebookProvider.fetchPostMetrics!({ ...params, posts: [...posts, { postId: 'p2', platformPostId: 'page_post2' }] })
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ postId: 'p2', commentsCount: 0 })
  })

  it('does not turn an empty or incomplete insight response into total engagement', () => {
    expect(mapFbPostInsights('p', 'pp', { data: [] }).engagements).toBeUndefined()
    expect(mapFbPostInsights('p', 'pp', { data: [] }, { comments: 2 }).engagements).toBeUndefined()
  })

  it('leaves null and malformed Facebook insight values unavailable', () => {
    for (const value of [null, '', 'NaN', false, Infinity, {}]) {
      expect(mapFbPostInsights('p', 'pp', { data: [{ name: 'post_clicks', values: [{ value }] }] }).clicks).toBeUndefined()
    }
  })

  it('preserves complete, measured zero engagement totals', () => {
    const metric = mapFbPostInsights('p', 'pp', { data: [{ name: 'post_clicks', values: [{ value: 0 }] }] }, { reactions: 0, comments: 0, shares: 0 })
    expect(metric.clicks).toBe(0)
    expect(metric.engagements).toBe(0)
  })

  it('rejects successful HTTP responses containing Graph errors or no metric data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 190 } })))
    await expect(facebookProvider.fetchAccountMetrics!(params)).rejects.toThrow(/unavailable/)
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
    await expect(facebookProvider.fetchPostMetrics!({ ...params, posts })).rejects.toThrow(/unavailable/)
  })

  it('uses only verified insight names and keeps credentials out of request URLs', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => json({ followers_count: 0, comments: { summary: { total_count: 0 } } }))
    vi.stubGlobal('fetch', fetchMock)
    await facebookProvider.fetchAccountMetrics!(params)
    await facebookProvider.fetchPostMetrics!({ ...params, posts })
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls.filter(url => url.includes('/insights')).map(url => new URL(url).searchParams.get('metric'))).toEqual(['page_views_total', 'post_clicks'])
    expect(urls.join(' ')).not.toContain('secret-token')
    expect(fetchMock.mock.calls.every(([, init]) => init?.headers && init?.signal)).toBe(true)
  })

  it('persists unavailable Facebook metrics as NULL while preserving actual zeroes', async () => {
    const db = { execute: vi.fn(async (_sql: string, _params?: unknown[]) => 1) }
    await upsertPostMetric(db, 'facebook', { postId: 'p', platformPostId: 'pp', commentsCount: 0 })
    expect(db.execute.mock.calls[0][1]).toEqual(['p', 'facebook', null, null, null, null, null, 0, null, null, null, null])
    await upsertAccountMetric(db, { clientId: 'c', accountId: 'a', platform: 'facebook', snapshotDate: '2026-10-12', metric: { followers: 0 } })
    expect(db.execute.mock.calls[1][1]).toEqual(['c', 'a', 'facebook', '2026-10-12', 0, null, null, null, 0])
  })

  it('preserves existing defaults for other platforms', async () => {
    const db = { execute: vi.fn(async (_sql: string, _params?: unknown[]) => 1) }
    await upsertPostMetric(db, 'instagram', { postId: 'p', platformPostId: 'pp', likes: 2 })
    expect(db.execute.mock.calls[0][1]).toEqual(['p', 'instagram', 0, 0, 0, 0, 2, 0, 0, 0, 0, 0])
  })
})
