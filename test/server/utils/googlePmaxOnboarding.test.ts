import { describe, expect, it } from 'vitest'
import { evaluateGooglePmaxOnboarding } from '~~/server/utils/googlePmaxOnboarding'

const readyEvidence = {
  countryCode: 'AU',
  googleAds: { customerId: '7583977544', status: 'active', adminAccess: true, apiAccess: true },
  merchant: { accountId: '5831245452', status: 'active', adminAccess: true, apiAccess: true },
  businessProfile: {
    accountId: 'accounts/1001',
    locationId: 'locations/2002',
    storeCode: 'BUNDOORA',
    verified: true,
    apiAccess: true
  },
  dealershipLocations: {
    source: 'business_profile',
    storeDataSourceId: null,
    storeDataSourceStatus: 'not_used',
    storeCodes: []
  },
  feed: { storeCodes: ['BUNDOORA'], destination: 'VEHICLE_ADS_ONLY' },
  links: { adsToMerchant: 'active', merchantToBusinessProfile: 'active' },
  vehicleAds: {
    addon: 'enabled',
    dealershipLicenseReview: 'approved',
    websiteReview: 'approved'
  }
} as const

describe('Google Vehicle Ads new-account onboarding gates', () => {
  it('keeps distinct Google identities and returns ready only after external reviews pass', () => {
    const result = evaluateGooglePmaxOnboarding(readyEvidence)

    expect(result.ready).toBe(true)
    expect(result.identities).toEqual({
      googleAdsCustomerId: '7583977544',
      merchantCenterAccountId: '5831245452',
      businessProfileAccountId: 'accounts/1001',
      businessProfileLocationId: 'locations/2002',
      dealershipLocationSource: 'business_profile',
      storeDataSourceId: null,
      storeCode: 'BUNDOORA'
    })
    expect(result.checks).toContainEqual(expect.objectContaining({
      code: 'PMAX_ONBOARDING_READY',
      status: 'pass'
    }))
  })

  it('turns a from-scratch account into explicit automatable and human tasks', () => {
    const result = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      googleAds: { customerId: null, status: 'missing', adminAccess: false, apiAccess: true },
      merchant: { accountId: null, status: 'missing', adminAccess: false, apiAccess: true },
      businessProfile: {
        accountId: null,
        locationId: null,
        storeCode: null,
        verified: false,
        apiAccess: true
      },
      feed: { storeCodes: [], destination: 'UNKNOWN' },
      links: { adsToMerchant: 'missing', merchantToBusinessProfile: 'missing' },
      vehicleAds: {
        addon: 'not_enabled',
        dealershipLicenseReview: 'not_started',
        websiteReview: 'not_started'
      }
    })

    expect(result.ready).toBe(false)
    expect(result.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'create-google-ads-account', execution: 'assisted' }),
      expect.objectContaining({ key: 'create-merchant-center-account', execution: 'assisted' }),
      expect.objectContaining({ key: 'create-business-profile-location', execution: 'assisted' }),
      expect.objectContaining({ key: 'verify-business-profile-location', execution: 'human' }),
      expect.objectContaining({ key: 'complete-dealership-license-review', execution: 'human' })
    ]))
  })

  it('allows API-assisted direct account linking only when the operator administers both accounts', () => {
    const linkable = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      links: { ...readyEvidence.links, adsToMerchant: 'missing' }
    })
    expect(linkable.tasks).toContainEqual(expect.objectContaining({
      key: 'link-google-ads-merchant-center',
      execution: 'automatable'
    }))

    const approvalRequired = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      merchant: { ...readyEvidence.merchant, adminAccess: false },
      links: { ...readyEvidence.links, adsToMerchant: 'pending' }
    })
    expect(approvalRequired.tasks).toContainEqual(expect.objectContaining({
      key: 'approve-google-ads-merchant-link',
      execution: 'human'
    }))
  })

  it('blocks a case-sensitive store-code mismatch and a non-Vehicle-Ads feed destination', () => {
    const result = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      feed: { storeCodes: ['bundoora'], destination: 'SHOPPING_ADS' }
    })

    expect(result.ready).toBe(false)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PMAX_STORE_CODE_MISMATCH', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_FEED_DESTINATION_INVALID', status: 'fail' })
    ]))
  })

  it('supports a governed store data source while still requiring the Business Profile account link', () => {
    const result = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      businessProfile: { ...readyEvidence.businessProfile, locationId: null, storeCode: null, verified: false },
      dealershipLocations: {
        source: 'store_data_source',
        storeDataSourceId: 'dataSources/3003',
        storeDataSourceStatus: 'active',
        storeCodes: ['BUNDOORA']
      }
    })

    expect(result.ready).toBe(true)
    expect(result.identities).toMatchObject({
      dealershipLocationSource: 'store_data_source',
      storeDataSourceId: 'dataSources/3003',
      storeCode: 'BUNDOORA'
    })
  })
})
