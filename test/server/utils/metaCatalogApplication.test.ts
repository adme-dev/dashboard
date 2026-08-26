import { describe, expect, it, vi } from 'vitest'
import {
  attachMetaCatalogFeedForClient,
  getMetaCatalogReadinessForClient,
  type MetaCatalogApplicationDeps
} from '~~/server/utils/metaCatalogApplication'

const connection = {
  id: 'connection-1',
  clientId: 'client-1',
  clientName: 'Geelong GWM Haval',
  accountId: '1444686743700725',
  actId: 'act_1444686743700725',
  accountName: 'Geelong GWM',
  accessToken: 'secret-token',
  tokenExpiresAt: '2026-09-01T00:00:00.000Z'
}

function deps(overrides: Partial<MetaCatalogApplicationDeps> = {}): MetaCatalogApplicationDeps {
  const graphProvider = {
    listGrantedPermissions: vi.fn().mockResolvedValue(['business_management', 'catalog_management']),
    getAdAccountBusiness: vi.fn().mockResolvedValue({ id: 'business-1', name: 'ADME Advertising' }),
    listBusinessCatalogs: vi.fn().mockResolvedValue([
      { id: 'catalog-1', name: 'Geelong vehicles', vertical: 'VEHICLES', ownership: 'owned' as const }
    ]),
    listProductFeeds: vi.fn().mockResolvedValue([]),
    createProductFeed: vi.fn().mockResolvedValue({ id: 'product-feed-1' }),
    updateProductFeed: vi.fn().mockResolvedValue(undefined),
    createProductFeedUpload: vi.fn().mockResolvedValue({ id: 'upload-1' }),
    getProductFeed: vi.fn().mockResolvedValue({
      id: 'product-feed-1',
      name: 'Geelong GWM Haval — Used Vehicles',
      schedule: {
        interval: 'DAILY',
        url: 'https://socials.driveagent.io/api/feeds/source-used/serve',
        hour: 0,
        timezone: 'Australia/Melbourne'
      },
      latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
    })
  }
  return {
    getConnectionAuthority: vi.fn().mockResolvedValue(connection),
    listBindings: vi.fn().mockResolvedValue([]),
    getDealerLink: vi.fn().mockResolvedValue({
      clientId: 'client-1',
      providerId: 'social-dashboard',
      externalOrgId: 'org-1',
      sellerRefs: ['geelong-gwm'],
      defaultFeedIds: ['source-used']
    }),
    listSourceFeeds: vi.fn().mockResolvedValue([
      { id: 'source-used', name: 'Used Vehicles', platform: 'facebook', isActive: true },
      { id: 'source-google', name: 'Google Used', platform: 'google', isActive: true }
    ]),
    resolveFeedBaseUrl: vi.fn().mockResolvedValue('https://socials.driveagent.io'),
    createProvider: vi.fn().mockReturnValue(graphProvider),
    persistEvidence: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('Meta catalogue application service', () => {
  it('derives the accessible Facebook source feeds from the stored client link', async () => {
    const d = deps()
    const result = await getMetaCatalogReadinessForClient({
      clientId: 'client-1',
      connectionId: 'connection-1',
      actorEmail: 'paul@adme.net.au'
    }, d)

    expect(d.getConnectionAuthority).toHaveBeenCalledWith('client-1', 'connection-1')
    expect(d.getDealerLink).toHaveBeenCalledWith('client-1')
    expect(d.listSourceFeeds).toHaveBeenCalledWith(expect.objectContaining({
      actorEmail: 'paul@adme.net.au',
      externalOrgId: 'org-1'
    }))
    expect(result).toMatchObject({
      state: 'FEED_SETUP_REQUIRED',
      sourceFeeds: [{ id: 'source-used', name: 'Used Vehicles', platform: 'facebook' }]
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  it('uses only the current linked Facebook feed identities for a provider mutation', async () => {
    const d = deps()
    const result = await attachMetaCatalogFeedForClient({
      clientId: 'client-1',
      connectionId: 'connection-1',
      catalogId: 'catalog-1',
      sourceFeedId: 'source-used',
      actorId: 'actor-1',
      actorEmail: 'paul@adme.net.au'
    }, d)

    expect(result).toMatchObject({ state: 'READY', productFeedId: 'product-feed-1' })
    expect(d.persistEvidence).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      sourceFeedId: 'source-used',
      businessId: 'business-1'
    }))
  })

  it('threads an explicit existing product-feed identity into the platform service', async () => {
    const d = deps()
    const graphProvider = d.createProvider({ accessToken: 'test-only' })
    vi.mocked(graphProvider.listProductFeeds).mockResolvedValue([{
      id: '638660590098129',
      name: 'Frankston Nissan',
      schedule: { interval: 'HOURLY', url: 'https://legacy.example/frankston.xml' }
    }])
    vi.mocked(graphProvider.getProductFeed).mockResolvedValue({
      id: '638660590098129',
      name: 'Geelong GWM Haval — Used Vehicles',
      schedule: {
        interval: 'DAILY',
        url: 'https://socials.driveagent.io/api/feeds/source-used/serve',
        hour: 0,
        timezone: 'Australia/Melbourne'
      },
      latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
    })

    const result = await attachMetaCatalogFeedForClient({
      clientId: 'client-1',
      connectionId: 'connection-1',
      catalogId: 'catalog-1',
      productFeedId: '638660590098129',
      sourceFeedId: 'source-used',
      actorId: 'actor-1',
      actorEmail: 'paul@adme.net.au'
    }, d)

    expect(graphProvider.createProductFeed).not.toHaveBeenCalled()
    expect(graphProvider.updateProductFeed).toHaveBeenCalledWith('638660590098129', expect.anything())
    expect(result).toMatchObject({ productFeedId: '638660590098129', feedDisposition: 'reused' })
  })

  it('fails closed when the client or active connection mapping is absent', async () => {
    const d = deps({ getConnectionAuthority: vi.fn().mockResolvedValue(null) })

    await expect(getMetaCatalogReadinessForClient({
      clientId: 'client-1',
      connectionId: 'connection-other',
      actorEmail: 'paul@adme.net.au'
    }, d)).rejects.toMatchObject({ statusCode: 404 })
    expect(d.createProvider).not.toHaveBeenCalled()
  })
})
