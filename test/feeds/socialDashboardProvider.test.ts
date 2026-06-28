import { describe, it, expect, vi } from 'vitest'
import { createSocialDashboardProvider } from '~~/server/utils/feeds/providers/socialDashboard'
import type { DealerLink, FeedRef, FeedProviderContext } from '~~/server/utils/feeds/types'

const ctx: FeedProviderContext = { actingUserEmail: 'p@x', externalOrgId: 'org-1' }
const link: DealerLink = { clientId: 'c1', providerId: 'social-dashboard', externalOrgId: 'org-1', sellerRefs: ['kia-springvale'], defaultFeedIds: [] }
const ref: FeedRef = { providerId: 'social-dashboard', feedId: 'f1', platform: 'google' }

function fakeClient(responses: Record<string, any>) {
  const call = vi.fn(async (_ctx, method: string, path: string) => responses[`${method} ${path}`])
  return { client: { call }, call }
}

describe('socialDashboard provider', () => {
  it('listFeeds normalizes the items array', async () => {
    const { client } = fakeClient({ 'GET /api/feeds?type=google': { ok: true, items: [{ id: 1, name: 'A', feed_type: 'google', is_active: true }] } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.listFeeds(ctx, link)
    expect(out).toEqual([{ id: '1', name: 'A', platform: 'google', isActive: true }])
  })

  it('searchInventory posts sellerRefs+filters and normalizes vehicles', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/search-inventory': { ok: true, total: 1, items: [{ id: 'v1', make: 'Kia', model: 'EV5', build_year: 2025, dap_price: 56990, images: ['x.jpg'] }] } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.searchInventory(ctx, link, { makes: ['Kia'] })
    expect(out.total).toBe(1)
    expect(out.items[0]).toMatchObject({ id: 'v1', make: 'Kia', price: 56990, image: 'x.jpg' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/search-inventory', { sellerRefs: ['kia-springvale'], filters: { makes: ['Kia'] } })
  })

  it('createFeed returns a FeedRef from the new id', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds': { ok: true, id: 'new9' } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.createFeed(ctx, link, { name: 'New', platform: 'facebook', filters: { a: 1 } })
    expect(out).toEqual({ providerId: 'social-dashboard', feedId: 'new9', platform: 'facebook' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds', { name: 'New', feed_type: 'facebook', filters: { a: 1 }, mappings: {}, source: undefined })
  })

  it('generateFeed returns url + itemCount', async () => {
    const { client } = fakeClient({ 'POST /api/feeds/generate': { ok: true, url: 'https://feed.xml', itemCount: 42 } })
    const p = createSocialDashboardProvider(client as any)
    expect(await p.generateFeed(ctx, ref, 'xml')).toEqual({ url: 'https://feed.xml', itemCount: 42 })
  })
})
