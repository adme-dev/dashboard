import { describe, expect, it, vi } from 'vitest'
import {
  createGooglePmaxPreflight,
  type GooglePmaxPreflightEvidence
} from '~~/server/utils/googlePmaxPreflight'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

const config: GooglePmaxInventoryLaunchConfig = {
  schemaVersion: 1,
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
  briefVersion: 1,
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  customerId: '1234567890',
  campaignName: 'CP Ford · New Vehicle PMax · July',
  budget: {
    currency: 'AUD',
    period: 'CUSTOM_PERIOD',
    startDate: '2026-07-17',
    endDate: '2026-07-31',
    campaignDays: 15,
    allocatedTotal: 1_000,
    dailyBudget: null,
    calculatedDailyPace: 1_000 / 15,
    provider: { totalAmountMicros: '1000000000', amountMicros: null }
  },
  bidding: { strategy: 'MAXIMIZE_CONVERSIONS' },
  schedule: { startDate: '2026-07-17', endDate: '2026-07-31' },
  locations: [{ criterionId: '1000567', displayName: 'Melbourne VIC' }],
  languages: ['en'],
  finalUrls: ['https://www.cpford.com.au/new-vehicles/'],
  merchantCenterId: '123456789',
  inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
  assetGroup: {
    name: 'CP Ford new vehicles',
    businessName: 'CP Ford',
    headlines: ['Explore New Ford Vehicles', 'Book a Test Drive', 'Find Your Next Ford'],
    longHeadlines: ['Explore the latest new Ford vehicles available from CP Ford'],
    descriptions: ['Browse new Ford vehicles and enquire today.', 'Book a test drive with the CP Ford team.'],
    imageAssetResourceNames: [],
    logoAssetResourceNames: [],
    youtubeVideoAssetResourceNames: []
  },
  conversionGoals: [{
    conversionActionId: '111',
    resourceName: 'customers/1234567890/conversionActions/111',
    category: 'SUBMIT_LEAD_FORM',
    origin: 'WEBSITE'
  }],
  approval: { required: true, complianceAcknowledged: true }
}

const evidence: GooglePmaxPreflightEvidence = {
  providerRequestId: 'request-123',
  connection: {
    id: config.connectionId,
    clientId: config.clientId,
    status: 'active',
    customerId: config.customerId,
    currency: 'AUD',
    timezone: 'Australia/Melbourne'
  },
  merchant: {
    linkedMerchantCenterIds: [config.merchantCenterId],
    sourceStatus: 'healthy',
    eligibleItemCount: 42,
    vehicleItemCount: 42,
    disapprovedItemCount: 0
  },
  internalFeed: {
    linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
    feedId: 'google-vehicles-au',
    platform: 'google',
    status: 'ready',
    matchedItemCount: 42,
    validatedItemCount: 42,
    invalidItemCount: 0,
    conditions: ['NEW'],
    fetchedAt: '2026-07-22T07:55:00.000Z'
  },
  conversions: [{
    conversionActionId: '111',
    resourceName: 'customers/1234567890/conversionActions/111',
    status: 'ENABLED',
    primaryForGoal: true,
    includeInConversionsMetric: true,
    recentConversions: true
  }],
  assets: {
    mode: 'merchant_only',
    textCoverageComplete: false,
    mediaCoverageComplete: false,
    allApproved: true
  },
  destinations: { allFinalUrlsVerified: true }
}

describe('Google PMax read-only preflight', () => {
  it('returns ready with explicit evidence and no provider write capability', async () => {
    const readEvidence = vi.fn().mockResolvedValue(evidence)
    const preflight = createGooglePmaxPreflight({ readEvidence })

    const result = await preflight.run(config)

    expect(result.ready).toBe(true)
    expect(result.blockerCount).toBe(0)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PMAX_ACCOUNT_READY', status: 'pass' }),
      expect.objectContaining({ code: 'PMAX_BUDGET_READY', status: 'pass' }),
      expect.objectContaining({ code: 'PMAX_MERCHANT_READY', status: 'pass' }),
      expect.objectContaining({ code: 'PMAX_INTERNAL_FEED_READY', status: 'pass' }),
      expect.objectContaining({ code: 'PMAX_CONVERSIONS_READY', status: 'pass' }),
      expect.objectContaining({ code: 'PMAX_ASSETS_MERCHANT_ONLY', status: 'warning' })
    ]))
    expect(readEvidence).toHaveBeenCalledOnce()
    expect(Object.keys(preflight)).toEqual(['run'])
  })

  it('fails closed on account, Merchant, conversion, and partial-asset mismatches', async () => {
    const readEvidence = vi.fn().mockResolvedValue({
      ...evidence,
      connection: { ...evidence.connection, clientId: '00000000-0000-4000-8000-000000000000', currency: 'USD' },
      merchant: { ...evidence.merchant, linkedMerchantCenterIds: [], eligibleItemCount: 0, vehicleItemCount: 0 },
      internalFeed: { ...evidence.internalFeed, status: 'blocked', validatedItemCount: 0, invalidItemCount: 42 },
      conversions: [{ ...evidence.conversions[0]!, status: 'REMOVED', recentConversions: false }],
      assets: { ...evidence.assets, mode: 'provided', textCoverageComplete: true, mediaCoverageComplete: false }
    })

    const result = await createGooglePmaxPreflight({ readEvidence }).run(config)

    expect(result.ready).toBe(false)
    expect(result.blockerCount).toBeGreaterThanOrEqual(4)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PMAX_ACCOUNT_OWNERSHIP_MISMATCH', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_ACCOUNT_CURRENCY_MISMATCH', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_MERCHANT_LINK_MISSING', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_INTERNAL_FEED_NOT_READY', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_CONVERSIONS_NOT_READY', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_ASSET_COVERAGE_INCOMPLETE', status: 'fail' })
    ]))
  })

  it('keeps a ready source feed launch reviewable when Merchant inventory counts lag', async () => {
    const readEvidence = vi.fn().mockResolvedValue({
      ...evidence,
      merchant: { ...evidence.merchant, eligibleItemCount: 40, vehicleItemCount: 40 }
    })

    const result = await createGooglePmaxPreflight({ readEvidence }).run(config)

    expect(result.ready).toBe(true)
    expect(result.checks).toContainEqual(expect.objectContaining({
      code: 'PMAX_FEED_COUNT_DRIFT',
      status: 'warning'
    }))
  })

  it('blocks inventory conditions that are absent from the client-owned source feed', async () => {
    const readEvidence = vi.fn().mockResolvedValue({
      ...evidence,
      internalFeed: { ...evidence.internalFeed, conditions: ['USED'] }
    })

    const result = await createGooglePmaxPreflight({ readEvidence }).run(config)

    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({
      code: 'PMAX_INTERNAL_FEED_CONDITION_MISMATCH',
      status: 'fail'
    }))
  })

  it('normalizes provider failures without leaking provider messages or credentials', async () => {
    const readEvidence = vi.fn().mockRejectedValue(Object.assign(
      new Error('Bearer secret-token customer 1234567890'),
      { code: 'PERMISSION_DENIED', requestId: 'request-safe' }
    ))

    const result = await createGooglePmaxPreflight({ readEvidence }).run(config)

    expect(result).toMatchObject({
      ready: false,
      blockerCount: 1,
      providerRequestId: 'request-safe',
      checks: [expect.objectContaining({
        code: 'PMAX_PROVIDER_READ_FAILED',
        status: 'fail',
        message: 'Google readiness evidence could not be read.'
      })]
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(JSON.stringify(result)).not.toContain('1234567890')
  })
})
