import { describe, expect, it } from 'vitest'
import { parseGooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfigRuntime'

function validConfig() {
  return {
    schemaVersion: 2,
    briefId: '23799282-283b-4508-b065-3fd36e8c05fd', briefVersion: 3,
    tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
    clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
    connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904', customerId: '1234567890',
    campaignName: 'Northern GAC Vehicles',
    budget: {
      currency: 'AUD', period: 'CUSTOM_PERIOD', startDate: '2026-08-08', endDate: '2026-09-06',
      campaignDays: 30, allocatedTotal: 700, dailyBudget: null,
      calculatedDailyPace: 700 / 30,
      provider: { totalAmountMicros: '700000000', amountMicros: null }
    },
    bidding: { strategy: 'MAXIMIZE_CONVERSIONS' },
    schedule: { startDate: '2026-08-08', endDate: '2026-09-06' },
    locations: [{ criterionId: '1000567', displayName: 'Bundoora VIC' }], languages: ['en'],
    finalUrls: ['https://northerngac.com.au/new-vehicles/'], merchantCenterId: '5831245452',
    inventorySource: {
      providerId: 'social-dashboard', linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
      feedId: 'google-vehicles-au', platform: 'google'
    },
    inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
    assetGroup: {
      mode: 'PROVIDED', name: 'Northern GAC', businessName: 'Northern GAC',
      headlines: ['Explore vehicles', 'Book a test drive', 'View stock'],
      longHeadlines: ['Explore new GAC vehicles available today'],
      descriptions: ['Browse available stock.', 'Enquire with the team.'],
      imageAssetResourceNames: ['customers/1234567890/assets/10'],
      logoAssetResourceNames: ['customers/1234567890/assets/20'], youtubeVideoAssetResourceNames: []
    },
    conversionGoals: [{
      conversionActionId: '111', resourceName: 'customers/1234567890/conversionActions/111',
      category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE'
    }],
    approval: { required: true, complianceAcknowledged: true }
  }
}

type TestConfig = ReturnType<typeof validConfig>

describe('Google PMax stored config runtime parser', () => {
  it('accepts the exact normalized version 2 contract', () => {
    expect(parseGooglePmaxInventoryLaunchConfig(validConfig())).toMatchObject({
      schemaVersion: 2, customerId: '1234567890', budget: { period: 'CUSTOM_PERIOD' }
    })
  })

  it.each([
    ['cross-customer conversion', (value: TestConfig) => { value.conversionGoals[0]!.resourceName = 'customers/9999999999/conversionActions/111' }],
    ['conflicting schedule', (value: TestConfig) => { value.schedule.endDate = '2026-09-07' }],
    ['incorrect micros', (value: TestConfig) => { value.budget.provider.totalAmountMicros = '23030000' }],
    ['unsafe URL', (value: TestConfig) => { value.finalUrls = ['http://localhost/vehicles'] }],
    ['partial merchant-only assets', (value: TestConfig) => { value.assetGroup.mode = 'MERCHANT_ONLY' }]
  ])('rejects %s in persisted JSON', (_label, mutate) => {
    const value = validConfig()
    mutate(value)
    expect(() => parseGooglePmaxInventoryLaunchConfig(value)).toThrow(/stored Google PMax launch configuration/i)
  })
})
