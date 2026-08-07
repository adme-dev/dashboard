import { describe, expect, it, vi } from 'vitest'
import {
  createGooglePmaxInternalFeedEvidenceReader,
  resolveGoogleFeedConditionsFromProviderEvidence
} from '~~/server/utils/googlePmaxInternalFeedEvidence'

const config = {
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  inventorySource: {
    providerId: 'social-dashboard' as const,
    linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
    feedId: 'google-vehicles-au',
    platform: 'google' as const
  }
}

function dependencies() {
  return {
    getActiveLink: vi.fn().mockResolvedValue({
      id: config.inventorySource.linkId,
      clientId: config.clientId,
      providerId: config.inventorySource.providerId,
      externalOrgId: 'org-1',
      sellerRefs: ['bundoora'],
      defaultFeedIds: [config.inventorySource.feedId]
    }),
    listFeeds: vi.fn().mockResolvedValue([{
      id: config.inventorySource.feedId,
      name: 'Google vehicles AU',
      platform: 'google',
      isActive: true
    }]),
    getFeed: vi.fn().mockResolvedValue({
      id: config.inventorySource.feedId,
      name: 'Google vehicles AU',
      platform: 'google',
      isActive: true,
      filters: {},
      mappings: {},
      platformSettings: {},
      source: null
    }),
    previewFeed: vi.fn().mockResolvedValue({
      total: 25,
      items: [],
      validation: {
        matchedTotal: 25,
        validatedTotal: 25,
        invalidTotal: 0,
        invalidSummaries: []
      }
    }),
    resolveConditions: vi.fn().mockReturnValue(['NEW']),
    now: () => new Date('2026-08-07T10:00:00.000Z')
  }
}

describe('Google PMax exact internal feed evidence reader', () => {
  it('reads readiness for the exact active client-owned Google feed', async () => {
    const deps = dependencies()
    const result = await createGooglePmaxInternalFeedEvidenceReader(deps).read(config)

    expect(result).toEqual({
      linkId: config.inventorySource.linkId,
      feedId: config.inventorySource.feedId,
      platform: 'google',
      status: 'ready',
      matchedItemCount: 25,
      validatedItemCount: 25,
      invalidItemCount: 0,
      conditions: ['NEW'],
      fetchedAt: '2026-08-07T10:00:00.000Z'
    })
    expect(deps.previewFeed).toHaveBeenCalledWith(
      expect.objectContaining({ id: config.inventorySource.linkId }),
      expect.objectContaining({ feedId: config.inventorySource.feedId, platform: 'google' }),
      { limit: 100, offset: 0 }
    )
  })

  it.each([
    ['PMAX_FEED_LINK_NOT_FOUND', null],
    ['PMAX_FEED_LINK_IDENTITY_MISMATCH', {
      id: '00000000-0000-4000-8000-000000000000',
      clientId: config.clientId,
      providerId: config.inventorySource.providerId,
      externalOrgId: 'org-1',
      sellerRefs: [],
      defaultFeedIds: []
    }]
  ])('fails closed with %s when the client link cannot be proven', async (code, link) => {
    const deps = dependencies()
    deps.getActiveLink.mockResolvedValue(link)

    await expect(createGooglePmaxInternalFeedEvidenceReader(deps).read(config)).rejects.toMatchObject({ code })
  })

  it('returns blocked evidence when the selected feed is inactive or not Google', async () => {
    const deps = dependencies()
    deps.listFeeds.mockResolvedValue([{
      id: config.inventorySource.feedId,
      name: 'Facebook vehicles',
      platform: 'facebook',
      isActive: false
    }])

    const result = await createGooglePmaxInternalFeedEvidenceReader(deps).read(config)

    expect(result).toMatchObject({
      platform: 'facebook',
      status: 'blocked',
      matchedItemCount: 0,
      validatedItemCount: 0
    })
    expect(deps.previewFeed).not.toHaveBeenCalled()
  })

  it('fails closed when provider validation or condition resolution is absent', async () => {
    const deps = dependencies()
    deps.previewFeed.mockResolvedValue({ total: 25, items: [] })
    deps.resolveConditions.mockReturnValue([])

    const result = await createGooglePmaxInternalFeedEvidenceReader(deps).read(config)

    expect(result).toMatchObject({ status: 'unknown', conditions: [] })
  })

  it('resolves only explicit Google condition mappings and recognized preview values', () => {
    const detail = {
      id: 'feed-1',
      name: 'Vehicles',
      platform: 'google' as const,
      isActive: true,
      filters: { listingTypes: ['new', 'demo'] },
      mappings: { condition: { values: { demo: 'new', preowned: 'used' } } },
      platformSettings: {},
      source: null
    }
    const preview = {
      total: 2,
      items: [
        { id: '1', make: 'Ford', model: 'Ranger', year: 2026, price: 1, condition: 'demo', stockNumber: '1', url: null, image: null },
        { id: '2', make: 'Ford', model: 'Everest', year: 2026, price: 1, condition: 'certified_preowned', stockNumber: '2', url: null, image: null }
      ]
    }

    expect(resolveGoogleFeedConditionsFromProviderEvidence(detail, preview)).toEqual(['NEW', 'USED'])
  })

  it('does not treat an unused mapping rule as proof that the feed contains that condition', () => {
    const detail = {
      id: 'feed-1',
      name: 'Vehicles',
      platform: 'google' as const,
      isActive: true,
      filters: { listingTypes: ['new', 'demo'] },
      mappings: { condition: { values: { demo: 'new', preowned: 'used' } } },
      platformSettings: {},
      source: null
    }

    expect(resolveGoogleFeedConditionsFromProviderEvidence(detail, { total: 0, items: [] })).toEqual(['NEW'])
  })
})
