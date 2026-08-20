import { describe, expect, it, vi } from 'vitest'
import {
  inspectMetaCatalogReadiness,
  ensureMetaCatalogFeed,
  type MetaCatalogProvider
} from '~~/server/utils/metaCatalogPlatform'

function provider(overrides: Partial<MetaCatalogProvider> = {}): MetaCatalogProvider {
  return {
    listGrantedPermissions: vi.fn().mockResolvedValue([
      'ads_management',
      'ads_read',
      'business_management',
      'catalog_management'
    ]),
    getAdAccountBusiness: vi.fn().mockResolvedValue({ id: 'business-1', name: 'Dealer business' }),
    listBusinessCatalogs: vi.fn().mockResolvedValue([
      { id: 'catalog-1', name: 'Dealer vehicles', vertical: 'vehicles', ownership: 'owned' }
    ]),
    listProductFeeds: vi.fn().mockResolvedValue([]),
    createProductFeed: vi.fn().mockResolvedValue({ id: 'meta-feed-1' }),
    updateProductFeed: vi.fn().mockResolvedValue(undefined),
    createProductFeedUpload: vi.fn().mockResolvedValue({ id: 'upload-1' }),
    getProductFeed: vi.fn().mockResolvedValue({
      id: 'meta-feed-1',
      name: 'Geelong GWM Used Vehicles',
      schedule: {
        interval: 'DAILY',
        url: 'https://socials.driveagent.io/api/feeds/source-used/serve',
        hour: 0,
        timezone: 'Australia/Melbourne'
      },
      latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
    }),
    ...overrides
  }
}

const connection = {
  id: 'connection-1',
  accountId: '1444686743700725',
  actId: 'act_1444686743700725',
  accountName: 'Geelong GWM',
  accessToken: 'secret-token'
}

describe('Meta catalogue platform readiness', () => {
  it('returns a one-time permission-upgrade action without attempting catalogue reads', async () => {
    const deps = provider({
      listGrantedPermissions: vi.fn().mockResolvedValue(['ads_management', 'ads_read'])
    })

    const result = await inspectMetaCatalogReadiness({ connection, bindings: [] }, deps)

    expect(result).toMatchObject({
      state: 'USER_GRANT_REQUIRED',
      missingPermissions: ['business_management', 'catalog_management'],
      action: {
        kind: 'GRANT_META_CATALOG_PERMISSION',
        href: '/api/agency/social/meta/connect?intent=catalog_management'
      }
    })
    expect(deps.getAdAccountBusiness).not.toHaveBeenCalled()
    expect(deps.listBusinessCatalogs).not.toHaveBeenCalled()
  })

  it('distinguishes Meta app advanced-access denial from an account reconnect', async () => {
    const deps = provider({
      listBusinessCatalogs: vi.fn().mockRejectedValue({
        data: { error: { code: 100, message: 'This application has not been approved to use this api.' } }
      })
    })

    const result = await inspectMetaCatalogReadiness({ connection, bindings: [] }, deps)

    expect(result).toMatchObject({
      state: 'APP_REVIEW_REQUIRED',
      action: { kind: 'REQUEST_META_ADVANCED_ACCESS' }
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  it('returns accessible catalogues and the feed setup action when permission is ready', async () => {
    const result = await inspectMetaCatalogReadiness({
      connection,
      bindings: [],
      sourceFeeds: [
        { id: 'source-used', name: 'Used Vehicles', platform: 'facebook' },
        { id: 'source-new', name: 'New & Demo Vehicles', platform: 'facebook' }
      ]
    }, provider())

    expect(result).toMatchObject({
      state: 'FEED_SETUP_REQUIRED',
      business: { id: 'business-1', name: 'Dealer business' },
      catalogs: [{ id: 'catalog-1', name: 'Dealer vehicles', ownership: 'owned' }],
      sourceFeeds: [
        { id: 'source-used', name: 'Used Vehicles' },
        { id: 'source-new', name: 'New & Demo Vehicles' }
      ],
      action: { kind: 'ATTACH_META_CATALOG_FEED' }
    })
  })

  it('does not offer a non-vehicle product catalogue for vehicle inventory delivery', async () => {
    const result = await inspectMetaCatalogReadiness({ connection, bindings: [] }, provider({
      listBusinessCatalogs: vi.fn().mockResolvedValue([
        { id: 'commerce-1', name: 'Merchandise', vertical: 'COMMERCE', ownership: 'owned' }
      ])
    }))

    expect(result).toMatchObject({ state: 'CATALOG_SETUP_REQUIRED', catalogs: [] })
  })
})

describe('Meta catalogue feed orchestration', () => {
  it('rechecks both catalogue permissions immediately before a provider write', async () => {
    const deps = provider({
      listGrantedPermissions: vi.fn().mockResolvedValue(['ads_read', 'business_management'])
    })

    await expect(ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'catalog-1',
      sourceFeedId: 'source-used',
      sourceFeedName: 'Used Vehicles',
      allowedSourceFeedIds: ['source-used'],
      feedBaseUrl: 'https://socials.driveagent.io',
      actorId: 'actor-1'
    }, deps)).rejects.toThrow('Meta catalogue permission is not currently granted')

    expect(deps.createProductFeed).not.toHaveBeenCalled()
    expect(deps.createProductFeedUpload).not.toHaveBeenCalled()
  })

  it('rejects an unlinked source feed before any Meta write', async () => {
    const deps = provider()

    await expect(ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'catalog-1',
      sourceFeedId: 'attacker-feed',
      sourceFeedName: 'Unknown feed',
      allowedSourceFeedIds: ['source-used'],
      feedBaseUrl: 'https://socials.driveagent.io',
      actorId: 'actor-1'
    }, deps)).rejects.toThrow('source feed is not linked to this client')

    expect(deps.createProductFeed).not.toHaveBeenCalled()
    expect(deps.createProductFeedUpload).not.toHaveBeenCalled()
  })

  it('rejects a non-vehicle catalogue before creating or uploading a feed', async () => {
    const deps = provider({
      listBusinessCatalogs: vi.fn().mockResolvedValue([
        { id: 'commerce-1', name: 'Merchandise', vertical: 'COMMERCE', ownership: 'owned' }
      ])
    })

    await expect(ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'commerce-1',
      sourceFeedId: 'source-used',
      sourceFeedName: 'Used Vehicles',
      allowedSourceFeedIds: ['source-used'],
      feedBaseUrl: 'https://socials.driveagent.io',
      actorId: 'actor-1'
    }, deps)).rejects.toThrow('vehicle catalogue')

    expect(deps.createProductFeed).not.toHaveBeenCalled()
    expect(deps.createProductFeedUpload).not.toHaveBeenCalled()
  })

  it('creates a daily feed, triggers an immediate URL upload, reads it back, and persists safe evidence', async () => {
    const persistEvidence = vi.fn().mockResolvedValue(undefined)
    const deps = provider()

    const result = await ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'catalog-1',
      sourceFeedId: 'source-used',
      sourceFeedName: 'Used Vehicles',
      allowedSourceFeedIds: ['source-used', 'source-new'],
      feedBaseUrl: 'https://socials.driveagent.io/',
      actorId: 'actor-1'
    }, { ...deps, persistEvidence })

    const expectedUrl = 'https://socials.driveagent.io/api/feeds/source-used/serve'
    expect(deps.createProductFeed).toHaveBeenCalledWith('catalog-1', expect.objectContaining({
      name: 'Geelong GWM Haval — Used Vehicles',
      schedule: {
        interval: 'DAILY',
        url: expectedUrl,
        hour: 0,
        timezone: 'Australia/Melbourne'
      }
    }))
    expect(deps.createProductFeedUpload).toHaveBeenCalledWith('meta-feed-1', expectedUrl)
    expect(deps.getProductFeed).toHaveBeenCalledWith('meta-feed-1')
    expect(persistEvidence).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      connectionId: 'connection-1',
      sourceFeedId: 'source-used',
      catalogId: 'catalog-1',
      productFeedId: 'meta-feed-1',
      uploadId: 'upload-1',
      feedDisposition: 'created',
      actorId: 'actor-1'
    }))
    expect(result).toMatchObject({ state: 'READY', productFeedId: 'meta-feed-1', uploadId: 'upload-1' })
    expect(JSON.stringify(persistEvidence.mock.calls)).not.toContain('secret-token')
  })

  it('F-6: accepts an HOURLY schedule and asserts the readback reflects it', async () => {
    const expectedUrl = 'https://socials.driveagent.io/api/feeds/source-used/serve'
    const deps = provider({
      getProductFeed: vi.fn().mockResolvedValue({
        id: 'meta-feed-1',
        name: 'Geelong GWM Haval — Used Vehicles',
        schedule: { interval: 'HOURLY', url: expectedUrl, timezone: 'Australia/Melbourne' },
        latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
      })
    })

    const result = await ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'catalog-1',
      sourceFeedId: 'source-used',
      sourceFeedName: 'Used Vehicles',
      allowedSourceFeedIds: ['source-used'],
      feedBaseUrl: 'https://socials.driveagent.io',
      actorId: 'actor-1',
      schedule: { interval: 'HOURLY' }
    }, deps)

    expect(deps.createProductFeed).toHaveBeenCalledWith('catalog-1', expect.objectContaining({
      schedule: { interval: 'HOURLY', url: expectedUrl, hour: 0, timezone: 'Australia/Melbourne' }
    }))
    expect(result.state).toBe('READY')
  })

  it('F-6: fails closed when the readback schedule does not match the requested schedule', async () => {
    const expectedUrl = 'https://socials.driveagent.io/api/feeds/source-used/serve'
    const deps = provider({
      getProductFeed: vi.fn().mockResolvedValue({
        id: 'meta-feed-1',
        name: 'Geelong GWM Haval — Used Vehicles',
        // URL matches, but Meta kept the old DAILY interval.
        schedule: { interval: 'DAILY', url: expectedUrl, hour: 0, timezone: 'Australia/Melbourne' },
        latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
      })
    })

    await expect(ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'catalog-1',
      sourceFeedId: 'source-used',
      sourceFeedName: 'Used Vehicles',
      allowedSourceFeedIds: ['source-used'],
      feedBaseUrl: 'https://socials.driveagent.io',
      actorId: 'actor-1',
      schedule: { interval: 'HOURLY' }
    }, deps)).rejects.toThrow('Meta feed readback did not match the requested fetch schedule')
  })

  it('reuses a matching remote feed on retry instead of creating a duplicate', async () => {
    const expectedUrl = 'https://socials.driveagent.io/api/feeds/source-used/serve'
    const deps = provider({
      listProductFeeds: vi.fn().mockResolvedValue([
        {
          id: 'existing-feed',
          name: 'Old display name',
          schedule: { interval: 'DAILY', url: expectedUrl, hour: 3 }
        }
      ]),
      getProductFeed: vi.fn().mockResolvedValue({
        id: 'existing-feed',
        name: 'Geelong GWM Haval — Used Vehicles',
        schedule: { interval: 'DAILY', url: expectedUrl, hour: 0, timezone: 'Australia/Melbourne' },
        latest_upload: { id: 'retry-upload', status: 'IN_PROGRESS' }
      }),
      createProductFeedUpload: vi.fn().mockResolvedValue({ id: 'retry-upload' })
    })

    const result = await ensureMetaCatalogFeed({
      connection,
      clientId: 'client-1',
      clientName: 'Geelong GWM Haval',
      catalogId: 'catalog-1',
      sourceFeedId: 'source-used',
      sourceFeedName: 'Used Vehicles',
      allowedSourceFeedIds: ['source-used'],
      feedBaseUrl: 'https://socials.driveagent.io',
      actorId: 'actor-1'
    }, deps)

    expect(deps.createProductFeed).not.toHaveBeenCalled()
    expect(deps.updateProductFeed).toHaveBeenCalledWith('existing-feed', expect.objectContaining({
      name: 'Geelong GWM Haval — Used Vehicles'
    }))
    expect(result.feedDisposition).toBe('reused')
    expect(result.productFeedId).toBe('existing-feed')
  })
})
