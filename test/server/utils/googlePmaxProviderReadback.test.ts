import { describe, expect, it, vi } from 'vitest'
import {
  createGooglePmaxProviderEvidenceReader,
  readGoogleMerchantVehicleEvidence
} from '~~/server/utils/googlePmaxProviderReadback'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

const config = {
  schemaVersion: 2,
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
  briefVersion: 1,
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  customerId: '1234567890',
  campaignName: 'Northern GAC Vehicles',
  budget: {
    period: 'CUSTOM_PERIOD', allocatedTotal: 700, dailyBudget: null,
    currency: 'AUD', startDate: '2026-08-08', endDate: '2026-09-06', campaignDays: 30,
    provider: { totalAmountMicros: '700000000', amountMicros: null }
  },
  bidding: { strategy: 'MAXIMIZE_CONVERSIONS' },
  schedule: { startDate: '2026-08-08', endDate: '2026-09-06' },
  locations: [{ criterionId: '1000567', displayName: 'Bundoora VIC' }],
  languages: ['en'],
  finalUrls: ['https://northerngac.com.au/new-vehicles/'],
  merchantCenterId: '5831245452',
  inventorySource: {
    providerId: 'social-dashboard',
    linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
    feedId: 'google-vehicles-au',
    platform: 'google'
  },
  inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
  assetGroup: {
    mode: 'PROVIDED',
    name: 'Northern GAC vehicles',
    businessName: 'Northern GAC',
    headlines: ['Explore new GAC vehicles', 'Book a test drive', 'View available stock'],
    longHeadlines: ['Explore new GAC vehicles available from Northern GAC'],
    descriptions: ['Browse the range and enquire today.', 'Book a test drive with Northern GAC.'],
    imageAssetResourceNames: ['customers/1234567890/assets/10'],
    logoAssetResourceNames: ['customers/1234567890/assets/20'],
    youtubeVideoAssetResourceNames: []
  },
  conversionGoals: [{
    conversionActionId: '111',
    resourceName: 'customers/1234567890/conversionActions/111',
    category: 'SUBMIT_LEAD_FORM',
    origin: 'WEBSITE'
  }],
  approval: { required: true, complianceAcknowledged: true }
} satisfies GooglePmaxInventoryLaunchConfig

function dependencies() {
  return {
    readConnection: vi.fn().mockResolvedValue({
      id: config.connectionId,
      clientId: config.clientId,
      status: 'active' as const,
      customerId: config.customerId,
      accessToken: 'never-return-this-token',
      developerToken: 'never-return-this-developer-token',
      loginCustomerId: '9999999999'
    }),
    queryAds: vi.fn(async (_auth: unknown, query: string) => {
      if (query.includes('FROM customer')) return [{ customer: {
        id: config.customerId,
        currencyCode: 'AUD',
        timeZone: 'Australia/Melbourne',
        status: 'ENABLED'
      } }]
      if (query.includes('FROM product_link')) return [{ productLink: {
        type: 'MERCHANT_CENTER',
        merchantCenter: { merchantCenterId: config.merchantCenterId }
      } }]
      if (query.includes('FROM conversion_action')) return [{
        conversionAction: {
          id: '111',
          resourceName: config.conversionGoals[0].resourceName,
          status: 'ENABLED',
          primaryForGoal: true,
          includeInConversionsMetric: true
        },
        metrics: { allConversions: 4 }
      }]
      if (query.includes('FROM asset')) return [
        { asset: { resourceName: 'customers/1234567890/assets/10', status: 'ENABLED' } },
        { asset: { resourceName: 'customers/1234567890/assets/20', status: 'ENABLED' } }
      ]
      throw new Error('Unexpected GAQL')
    }),
    readMerchant: vi.fn().mockResolvedValue({
      sourceStatus: 'healthy' as const,
      eligibleItemCount: 25,
      vehicleItemCount: 25,
      disapprovedItemCount: 0,
      allowedFinalUrlHosts: ['northerngac.com.au'],
      complete: true,
      requestId: 'merchant-request-1'
    }),
    readInternalFeed: vi.fn().mockResolvedValue({
      linkId: config.inventorySource.linkId,
      feedId: config.inventorySource.feedId,
      platform: 'google' as const,
      status: 'ready' as const,
      matchedItemCount: 25,
      validatedItemCount: 25,
      invalidItemCount: 0,
      conditions: ['NEW' as const],
      fetchedAt: '2026-08-07T10:00:00.000Z'
    })
  }
}

describe('Google PMax provider readback', () => {
  it('combines exact Ads, Merchant, feed, conversion, asset, and destination reads', async () => {
    const deps = dependencies()
    const evidence = await createGooglePmaxProviderEvidenceReader(deps).read(config)

    expect(evidence).toMatchObject({
      providerRequestId: 'merchant-request-1',
      connection: {
        id: config.connectionId,
        clientId: config.clientId,
        customerId: config.customerId,
        currency: 'AUD',
        timezone: 'Australia/Melbourne'
      },
      merchant: {
        linkedMerchantCenterIds: [config.merchantCenterId],
        sourceStatus: 'healthy',
        eligibleItemCount: 25,
        vehicleItemCount: 25,
        disapprovedItemCount: 0
      },
      conversions: [expect.objectContaining({
        conversionActionId: '111', recentConversions: true
      })],
      assets: {
        mode: 'provided',
        textCoverageComplete: true,
        mediaCoverageComplete: true,
        allApproved: true
      },
      destinations: { allFinalUrlsVerified: true }
    })
    expect(JSON.stringify(evidence)).not.toContain('never-return-this')
    expect(deps.queryAds).toHaveBeenCalledTimes(4)
  })

  it('fails closed when the connection readback belongs to another client', async () => {
    const deps = dependencies()
    deps.readConnection.mockResolvedValue({
      ...await deps.readConnection(),
      clientId: '00000000-0000-4000-8000-000000000000'
    })

    await expect(createGooglePmaxProviderEvidenceReader(deps).read(config))
      .rejects.toMatchObject({ code: 'PMAX_PROVIDER_CONNECTION_SCOPE_MISMATCH' })
    expect(deps.queryAds).not.toHaveBeenCalled()
  })

  it('marks narrowed or incomplete provider responses unsafe instead of treating them as complete', async () => {
    const deps = dependencies()
    deps.readMerchant.mockResolvedValue({
      sourceStatus: 'warning',
      eligibleItemCount: 25,
      vehicleItemCount: 25,
      disapprovedItemCount: 0,
      allowedFinalUrlHosts: ['northerngac.com.au'],
      complete: false,
      requestId: null
    })

    const evidence = await createGooglePmaxProviderEvidenceReader(deps).read(config)
    expect(evidence.merchant).toMatchObject({ sourceStatus: 'error', eligibleItemCount: 0 })
  })
})

describe('Merchant API vehicle evidence', () => {
  it('paginates processed products and counts only AU Vehicle Ads eligibility', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        products: [{
          name: 'accounts/5831245452/products/en~AU~VIN1',
          productAttributes: { link: 'https://northerngac.com.au/vehicle/vin1' },
          productStatus: { destinationStatuses: [{
            reportingContext: 'VEHICLE_INVENTORY_ADS',
            approvedCountries: ['AU']
          }] }
        }],
        nextPageToken: 'next-page'
      }), { status: 200, headers: { 'x-request-id': 'request-a' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        products: [{
          name: 'accounts/5831245452/products/en~AU~VIN2',
          productAttributes: { link: 'https://northerngac.com.au/vehicle/vin2' },
          productStatus: { destinationStatuses: [{
            reportingContext: 'VEHICLE_INVENTORY_ADS',
            disapprovedCountries: ['AU']
          }] }
        }]
      }), { status: 200 }))

    const result = await readGoogleMerchantVehicleEvidence({
      merchantCenterId: '5831245452',
      accessToken: 'merchant-access',
      fetch,
      maximumProducts: 500
    })

    expect(result).toEqual({
      sourceStatus: 'warning',
      eligibleItemCount: 1,
      vehicleItemCount: 2,
      disapprovedItemCount: 1,
      allowedFinalUrlHosts: ['northerngac.com.au'],
      complete: true,
      requestId: 'request-a'
    })
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('pageToken=next-page'), expect.any(Object))
  })

  it('rejects malformed Merchant payloads and caps pagination', async () => {
    const malformedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: {} }), { status: 200 }))
    await expect(readGoogleMerchantVehicleEvidence({
      merchantCenterId: '5831245452', accessToken: 'merchant-access', fetch: malformedFetch
    })).rejects.toMatchObject({ code: 'PMAX_MERCHANT_RESPONSE_INVALID' })

    const cappedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      products: Array.from({ length: 250 }, (_, index) => ({
        name: `accounts/5831245452/products/en~AU~${index}`,
        productStatus: { destinationStatuses: [] }
      })),
      nextPageToken: 'still-more'
    }), { status: 200 }))
    const capped = await readGoogleMerchantVehicleEvidence({
      merchantCenterId: '5831245452', accessToken: 'merchant-access', fetch: cappedFetch, maximumProducts: 250
    })
    expect(capped.complete).toBe(false)
  })
})
