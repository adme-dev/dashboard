import { describe, it, expect, vi } from 'vitest'
import type { SocialDashboardClient } from '~~/server/utils/feeds/socialDashboardClient'
import { buildInventoryPreviewFilters, createSocialDashboardProvider } from '~~/server/utils/feeds/providers/socialDashboard'
import type { DealerLink, FeedRef, FeedProviderContext } from '~~/server/utils/feeds/types'

const ctx: FeedProviderContext = { actingUserEmail: 'p@x', externalOrgId: 'org-1' }
const link: DealerLink = { clientId: 'c1', providerId: 'social-dashboard', externalOrgId: 'org-1', sellerRefs: ['kia-springvale'], defaultFeedIds: [] }
const ref: FeedRef = { providerId: 'social-dashboard', feedId: 'f1', platform: 'google' }

function fakeClient(responses: Record<string, unknown>) {
  const call = vi.fn(async (_ctx, method: string, path: string, _body?: unknown) => {
    const key = `${method} ${path}`
    const response = Array.isArray(responses[key])
      ? (responses[key] as unknown[]).shift()
      : responses[key]
    if (response instanceof Error) throw response
    return response
  })
  return { client: { call } as unknown as SocialDashboardClient, call }
}

describe('socialDashboard provider', () => {
  it('listFeeds normalizes the items array', async () => {
    const { client, call } = fakeClient({ 'GET /api/feeds?orgId=org-1': { ok: true, items: [{ id: 1, name: 'A', feed_type: 'google', is_active: true }] } })
    const p = createSocialDashboardProvider(client)
    const out = await p.listFeeds(ctx, link)
    expect(out).toEqual([{ id: '1', name: 'A', platform: 'google', isActive: true }])
    expect(call).toHaveBeenCalledWith(ctx, 'GET', '/api/feeds?orgId=org-1')
  })

  it('searchInventory previews seller-scoped filters and normalizes vehicles', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/preview': { ok: true, total: 1, items: [{ id: 'v1', make: 'Kia', model: 'EV5', build_year: 2025, dap_price: 56990, images: ['x.jpg'] }] } })
    const p = createSocialDashboardProvider(client)
    const out = await p.searchInventory(ctx, link, { makes: ['Kia'] })
    expect(out.total).toBe(1)
    expect(out.items[0]).toMatchObject({ id: 'v1', make: 'Kia', price: 56990, image: 'x.jpg' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/preview', {
      filters: { makes: ['Kia'], sellerIds: ['kia-springvale'] },
      limit: 100,
      offset: 0
    })
  })

  it('previews a draft feed spec with validation before creating the feed', async () => {
    const { client, call } = fakeClient({
      'POST /api/feeds/preview': {
        ok: true,
        total: 7,
        matchedTotal: 7,
        validatedTotal: 5,
        invalidTotal: 2,
        invalidSummaries: [
          { id: 'v1', issues: [{ field: 'url', message: 'url is required' }] }
        ],
        items: [
          {
            id: 'v2',
            make: 'Hyundai',
            model: 'Tucson',
            build_year: 2025,
            dap_price: 52990,
            listing_type: 'New',
            stock_number: 'BH123',
            images: ['https://inventory.example/tucson.jpg'],
            url: 'https://dealer.example/tucson'
          }
        ]
      }
    })
    const p = createSocialDashboardProvider(client)

    const out = await p.previewInventory(ctx, link, {
      name: 'Meta Blood Hyundai',
      platform: 'facebook',
      filters: { condition: ['New'] },
      mappings: { id: 'vehicle_id' },
      platformSettings: { catalog_id: 'cat-1' },
      source: { type: 'meilisearch' }
    }, { limit: 8, offset: 0 })

    expect(out.total).toBe(7)
    expect(out.items[0]).toMatchObject({ id: 'v2', make: 'Hyundai', url: 'https://dealer.example/tucson' })
    expect(out.validation).toMatchObject({ matchedTotal: 7, validatedTotal: 5, invalidTotal: 2 })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/preview', {
      filters: { condition: ['New'], sellerIds: ['kia-springvale'] },
      limit: 8,
      offset: 0,
      validateForFeed: {
        feedType: 'facebook',
        mappings: { id: 'vehicle_id' },
        platformSettings: { catalog_id: 'cat-1', feed_name: 'Meta Blood Hyundai' },
        source: { type: 'meilisearch' }
      }
    })
  })

  it('previews existing feeds with linked dealer seller refs and feed source settings', async () => {
    const { client, call } = fakeClient({
      'GET /api/feeds/f1': {
        ok: true,
        item: {
          id: 'f1',
          name: 'Blood Hyundai',
          feed_type: 'facebook',
          filters: { makes: ['Hyundai'] },
          mappings: { rules: [] },
          platform_settings: { catalog_id: 'cat-1' },
          source: { type: 'meilisearch', url: 'https://inventory.example' }
        }
      },
      'POST /api/feeds/preview': { ok: true, total: 0, items: [] }
    })
    const p = createSocialDashboardProvider(client)
    await p.previewFeed(ctx, link, { ...ref, platform: 'facebook' }, { limit: 20, offset: 0, search: ' tucson ' })
    expect(call).toHaveBeenCalledWith(ctx, 'GET', '/api/feeds/f1')
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/preview', {
      filters: { makes: ['Hyundai'], search: 'tucson', sellerIds: ['kia-springvale'] },
      limit: 20,
      offset: 0,
      validateForFeed: {
        feedType: 'facebook',
        mappings: { rules: [] },
        platformSettings: { catalog_id: 'cat-1', feed_name: 'Blood Hyundai' },
        source: { type: 'meilisearch', url: 'https://inventory.example' }
      }
    })
  })

  it('falls back to raw scoped inventory when feed validation returns no valid vehicles', async () => {
    const { client, call } = fakeClient({
      'GET /api/feeds/f1': {
        ok: true,
        item: {
          id: 'f1',
          name: 'Blood Hyundai',
          feed_type: 'facebook',
          filters: { makes: ['Hyundai'] },
          mappings: { rules: [] },
          platform_settings: { catalog_id: 'cat-1' },
          source: { type: 'meilisearch' }
        }
      },
      'POST /api/feeds/preview': [
        {
          ok: true,
          total: 88,
          matchedTotal: 88,
          validatedTotal: 0,
          invalidTotal: 88,
          candidateLimit: 500,
          invalidSummaries: [
            { id: 'v1', issues: [{ field: 'image_link', message: 'Image is required' }] }
          ],
          items: []
        },
        {
          ok: true,
          total: 88,
          items: [
            {
              id: 'v1',
              make: 'Hyundai',
              model: 'Tucson',
              build_year: 2025,
              dap_price: 51990,
              listing_type: 'New',
              stock_number: 'B123',
              images: ['https://inventory.example/tucson.jpg']
            }
          ]
        }
      ]
    })
    const p = createSocialDashboardProvider(client)

    const out = await p.previewFeed(ctx, link, { ...ref, platform: 'facebook' }, { limit: 20, offset: 0 })

    expect(out.total).toBe(88)
    expect(out.items).toEqual([
      {
        id: 'v1',
        make: 'Hyundai',
        model: 'Tucson',
        year: 2025,
        price: 51990,
        condition: 'New',
        stockNumber: 'B123',
        url: null,
        image: 'https://inventory.example/tucson.jpg'
      }
    ])
    expect(out.validation).toMatchObject({
      matchedTotal: 88,
      validatedTotal: 0,
      invalidTotal: 88,
      candidateLimit: 500,
      showingFallbackCandidates: true
    })
    expect(out.validation?.invalidSummaries).toEqual([
      { id: 'v1', issues: [{ field: 'image_link', message: 'Image is required' }] }
    ])
    expect(call).toHaveBeenNthCalledWith(2, ctx, 'POST', '/api/feeds/preview', {
      filters: { makes: ['Hyundai'], sellerIds: ['kia-springvale'] },
      limit: 20,
      offset: 0,
      validateForFeed: {
        feedType: 'facebook',
        mappings: { rules: [] },
        platformSettings: { catalog_id: 'cat-1', feed_name: 'Blood Hyundai' },
        source: { type: 'meilisearch' }
      }
    })
    expect(call).toHaveBeenNthCalledWith(3, ctx, 'POST', '/api/feeds/preview', {
      filters: { makes: ['Hyundai'], sellerIds: ['kia-springvale'] },
      limit: 20,
      offset: 0
    })
  })

  it('createFeed upserts by external identity and returns a FeedRef', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/upsert-external': { ok: true, feedId: 'new9', created: true } })
    const p = createSocialDashboardProvider(client)
    const out = await p.createFeed(ctx, link, {
      name: 'New',
      platform: 'facebook',
      filters: { a: 1, sellerIds: ['kia-springvale'] },
      platformSettings: { store_code: 'BLOOD-HYUNDAI' },
      externalCampaignId: 'cmp-1'
    })
    expect(out).toEqual({ providerId: 'social-dashboard', feedId: 'new9', platform: 'facebook' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/upsert-external', {
      name: 'New',
      feed_type: 'facebook',
      organization_id: 'org-1',
      filters: { a: 1, sellerIds: ['kia-springvale'] },
      mappings: {},
      platform_settings: { store_code: 'BLOOD-HYUNDAI' },
      source: undefined,
      externalKey: undefined,
      externalClientId: 'c1',
      externalCampaignId: 'cmp-1',
      externalFeedId: undefined
    })
  })

  it('createFeed falls back to legacy create when upsert endpoint is unavailable', async () => {
    const { client, call } = fakeClient({
      'POST /api/feeds/upsert-external': new Error('social-dashboard POST /api/feeds/upsert-external → 404: missing'),
      'POST /api/feeds': { ok: true, id: 'legacy9' }
    })
    const p = createSocialDashboardProvider(client)
    const out = await p.createFeed(ctx, link, { name: 'Legacy', platform: 'google', filters: { b: 2 } })
    expect(out).toEqual({ providerId: 'social-dashboard', feedId: 'legacy9', platform: 'google' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds', {
      name: 'Legacy',
      feed_type: 'google',
      organization_id: 'org-1',
      filters: { b: 2, sellerIds: ['kia-springvale'] },
      mappings: {},
      platform_settings: {},
      source: undefined
    })
  })

  it('throws when the context org does not match the link org', async () => {
    const { client } = fakeClient({})
    const p = createSocialDashboardProvider(client)
    const badCtx: FeedProviderContext = { actingUserEmail: 'p@x', externalOrgId: 'org-OTHER' }
    await expect(p.searchInventory(badCtx, link, {})).rejects.toThrow(/org mismatch/i)
  })

  it('generateFeed normalizes the nested social-dashboard response', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/generate': { ok: true, meta: { url: 'https://feed.xml', itemCount: 42 } } })
    const p = createSocialDashboardProvider(client)
    expect(await p.generateFeed(ctx, ref, 'xml')).toEqual({ url: 'https://feed.xml', itemCount: 42 })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/generate', { feedId: 'f1', format: 'xml' })
  })

  it('getMetrics maps social-dashboard vehicle stats into feed metrics', async () => {
    const { client } = fakeClient({ 'GET /api/feeds/f1/metrics': { ok: true, vehicleStats: { forSaleNow: 17 } } })
    const p = createSocialDashboardProvider(client)
    expect(await p.getMetrics(ctx, ref)).toMatchObject({ inventory: 17, active: 17, issues: 0 })
  })
})

describe('buildInventoryPreviewFilters', () => {
  it('intersects requested flat sellers with linked seller refs', () => {
    expect(buildInventoryPreviewFilters(
      { sellerIds: ['kia-springvale', 'other'], makes: ['Kia'] },
      ['kia-springvale']
    )).toEqual({ sellerIds: ['kia-springvale'], makes: ['Kia'] })
  })

  it('forces an empty seller match when requested sellers are outside the link', () => {
    expect(buildInventoryPreviewFilters(
      { sellerIds: ['other'] },
      ['kia-springvale']
    )).toEqual({ sellerIds: ['__no_matching_seller__'] })
  })

  it('expands rulesets without a seller across linked seller refs and removes manual include bypasses', () => {
    expect(buildInventoryPreviewFilters(
      { rulesets: [{ id: 'r1', sellerId: '', makes: ['Kia'] }], manualIncludeIds: ['v1'] },
      ['seller-a', 'seller-b']
    )).toEqual({
      rulesets: [
        { id: 'r1:seller-a', sellerId: 'seller-a', makes: ['Kia'] },
        { id: 'r1:seller-b', sellerId: 'seller-b', makes: ['Kia'] }
      ],
      manualIncludeIds: undefined
    })
  })
})
