import { describe, it, expect, vi } from 'vitest'
import { buildInventoryPreviewFilters, createSocialDashboardProvider } from '~~/server/utils/feeds/providers/socialDashboard'
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
    const { client, call } = fakeClient({ 'GET /api/feeds?orgId=org-1': { ok: true, items: [{ id: 1, name: 'A', feed_type: 'google', is_active: true }] } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.listFeeds(ctx, link)
    expect(out).toEqual([{ id: '1', name: 'A', platform: 'google', isActive: true }])
    expect(call).toHaveBeenCalledWith(ctx, 'GET', '/api/feeds?orgId=org-1')
  })

  it('searchInventory previews seller-scoped filters and normalizes vehicles', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/preview': { ok: true, total: 1, items: [{ id: 'v1', make: 'Kia', model: 'EV5', build_year: 2025, dap_price: 56990, images: ['x.jpg'] }] } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.searchInventory(ctx, link, { makes: ['Kia'] })
    expect(out.total).toBe(1)
    expect(out.items[0]).toMatchObject({ id: 'v1', make: 'Kia', price: 56990, image: 'x.jpg' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/preview', {
      filters: { makes: ['Kia'], sellerIds: ['kia-springvale'] },
      limit: 100,
      offset: 0,
    })
  })

  it('createFeed returns a FeedRef from the new id', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds': { ok: true, id: 'new9' } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.createFeed(ctx, link, { name: 'New', platform: 'facebook', filters: { a: 1 } })
    expect(out).toEqual({ providerId: 'social-dashboard', feedId: 'new9', platform: 'facebook' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds', { name: 'New', feed_type: 'facebook', organization_id: 'org-1', filters: { a: 1 }, mappings: {}, source: undefined })
  })

  it('throws when the context org does not match the link org', async () => {
    const { client } = fakeClient({})
    const p = createSocialDashboardProvider(client as any)
    const badCtx = { actingUserEmail: 'p@x', externalOrgId: 'org-OTHER' }
    await expect(p.searchInventory(badCtx as any, link, {})).rejects.toThrow(/org mismatch/i)
  })

  it('generateFeed normalizes the nested social-dashboard response', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/generate': { ok: true, meta: { url: 'https://feed.xml', itemCount: 42 } } })
    const p = createSocialDashboardProvider(client as any)
    expect(await p.generateFeed(ctx, ref, 'xml')).toEqual({ url: 'https://feed.xml', itemCount: 42 })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/generate', { feedId: 'f1', format: 'xml' })
  })

  it('getMetrics maps social-dashboard vehicle stats into feed metrics', async () => {
    const { client } = fakeClient({ 'GET /api/feeds/f1/metrics': { ok: true, vehicleStats: { forSaleNow: 17 } } })
    const p = createSocialDashboardProvider(client as any)
    expect(await p.getMetrics(ctx, ref)).toMatchObject({ inventory: 17, active: 17, issues: 0 })
  })
})

describe('buildInventoryPreviewFilters', () => {
  it('intersects requested flat sellers with linked seller refs', () => {
    expect(buildInventoryPreviewFilters(
      { sellerIds: ['kia-springvale', 'other'], makes: ['Kia'] },
      ['kia-springvale'],
    )).toEqual({ sellerIds: ['kia-springvale'], makes: ['Kia'] })
  })

  it('forces an empty seller match when requested sellers are outside the link', () => {
    expect(buildInventoryPreviewFilters(
      { sellerIds: ['other'] },
      ['kia-springvale'],
    )).toEqual({ sellerIds: ['__no_matching_seller__'] })
  })

  it('expands rulesets without a seller across linked seller refs and removes manual include bypasses', () => {
    expect(buildInventoryPreviewFilters(
      { rulesets: [{ id: 'r1', sellerId: '', makes: ['Kia'] }], manualIncludeIds: ['v1'] },
      ['seller-a', 'seller-b'],
    )).toEqual({
      rulesets: [
        { id: 'r1:seller-a', sellerId: 'seller-a', makes: ['Kia'] },
        { id: 'r1:seller-b', sellerId: 'seller-b', makes: ['Kia'] },
      ],
      manualIncludeIds: undefined,
    })
  })
})
