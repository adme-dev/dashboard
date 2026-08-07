import { describe, expect, it } from 'vitest'
import { evaluateGooglePmaxOnboarding } from '~~/server/utils/googlePmaxOnboarding'

const readyEvidence = {
  countryCode: 'AU',
  platform: {
    googleCloudProjectId: 'gen-lang-client-0818792107',
    oauth: {
      clientConfigured: true,
      consentScreenConfigured: true,
      offlineAccessGranted: true,
      googleAdsScopeGranted: true,
      merchantScopeGranted: true,
      businessProfileScopeGranted: true
    },
    googleAdsApi: { enabled: true, developerTokenAccess: 'basic' },
    merchantApi: { enabled: true, createAndConfigureAccess: true, providerAccountId: 'accounts/9001' },
    businessProfileApis: { enabled: true, access: 'approved' }
  },
  googleAds: {
    customerId: '7583977544',
    managerCustomerId: '1002003004',
    status: 'active',
    adminAccess: true,
    apiAccess: true,
    clientAccountCreationEligible: true,
    currencyCode: 'AUD',
    timeZone: 'Australia/Melbourne',
    billingStatus: 'active',
    policyStatus: 'clear'
  },
  merchant: {
    accountId: '5831245452',
    status: 'active',
    adminAccess: true,
    apiAccess: true,
    clientAdminPresent: true,
    termsOfService: 'accepted',
    businessInformation: 'complete',
    homepage: 'claimed'
  },
  businessProfile: {
    accountId: 'accounts/1001',
    locationId: 'locations/2002',
    storeCode: 'BUNDOORA',
    verified: true,
    apiAccess: true,
    accessRole: 'owner',
    locationStatus: 'active',
    duplicateCheck: 'clear',
    physicalStoreConfirmed: true
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
    websiteReview: 'approved',
    accountStateScope: 'single_state'
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
    expect(result.shopIdentity).toEqual({
      kind: 'business_profile_location_and_store_code',
      locationResourceName: 'locations/2002',
      storeCode: 'BUNDOORA'
    })
    expect(result.apiCapabilities).toMatchObject({
      createGoogleAdsClient: true,
      createMerchantAccount: true,
      discoverBusinessProfileLocation: true,
      linkMerchantBusinessProfile: true
    })
    expect(result.checks).toContainEqual(expect.objectContaining({
      code: 'PMAX_ONBOARDING_READY',
      status: 'pass'
    }))
  })

  it('turns a from-scratch account into explicit automatable and human tasks', () => {
    const result = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      googleAds: {
        ...readyEvidence.googleAds,
        customerId: null,
        status: 'missing',
        adminAccess: false,
        currencyCode: null,
        timeZone: null,
        billingStatus: 'missing'
      },
      merchant: {
        ...readyEvidence.merchant,
        accountId: null,
        status: 'missing',
        adminAccess: false,
        clientAdminPresent: false,
        termsOfService: 'not_accepted',
        businessInformation: 'missing',
        homepage: 'unverified'
      },
      businessProfile: {
        ...readyEvidence.businessProfile,
        accountId: null,
        locationId: null,
        storeCode: null,
        verified: false,
        accessRole: 'none',
        locationStatus: 'missing',
        duplicateCheck: 'unknown',
        physicalStoreConfirmed: false
      },
      feed: { storeCodes: [], destination: 'UNKNOWN' },
      links: { adsToMerchant: 'missing', merchantToBusinessProfile: 'missing' },
      vehicleAds: {
        addon: 'not_enabled',
        dealershipLicenseReview: 'not_started',
        websiteReview: 'not_started',
        accountStateScope: 'unknown'
      }
    })

    expect(result.ready).toBe(false)
    expect(result.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'create-google-ads-account', execution: 'automatable' }),
      expect.objectContaining({ key: 'create-merchant-center-account', execution: 'automatable' }),
      expect.objectContaining({ key: 'create-business-profile-location', execution: 'assisted' }),
      expect.objectContaining({ key: 'verify-business-profile-location', execution: 'human' }),
      expect.objectContaining({ key: 'complete-dealership-license-review', execution: 'human' }),
      expect.objectContaining({ key: 'choose-google-ads-currency-timezone', execution: 'human' }),
      expect.objectContaining({ key: 'configure-google-ads-billing', execution: 'human' }),
      expect.objectContaining({ key: 'accept-merchant-terms', execution: 'human' }),
      expect.objectContaining({ key: 'claim-merchant-homepage', execution: 'assisted' }),
      expect.objectContaining({ key: 'confirm-physical-dealership', execution: 'human' })
    ]))
  })

  it('exposes platform API prerequisites as stable tasks without pretending legal or ownership steps are automatable', () => {
    const result = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      platform: {
        ...readyEvidence.platform,
        googleCloudProjectId: null,
        oauth: {
          clientConfigured: false,
          consentScreenConfigured: false,
          offlineAccessGranted: false,
          googleAdsScopeGranted: false,
          merchantScopeGranted: false,
          businessProfileScopeGranted: false
        },
        googleAdsApi: { enabled: false, developerTokenAccess: 'missing' },
        merchantApi: { enabled: false, createAndConfigureAccess: false, providerAccountId: null },
        businessProfileApis: { enabled: false, access: 'not_requested' }
      }
    })

    expect(result.ready).toBe(false)
    expect(result.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'configure-google-cloud-project', owner: 'platform' }),
      expect.objectContaining({ key: 'configure-google-oauth', owner: 'platform' }),
      expect.objectContaining({ key: 'obtain-google-ads-developer-token', execution: 'human' }),
      expect.objectContaining({ key: 'enable-merchant-api', execution: 'assisted' }),
      expect.objectContaining({ key: 'request-business-profile-api-access', execution: 'human' })
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

  it('blocks duplicate or closed locations and multi-state Vehicle Ads accounts', () => {
    const result = evaluateGooglePmaxOnboarding({
      ...readyEvidence,
      businessProfile: {
        ...readyEvidence.businessProfile,
        locationStatus: 'permanently_closed',
        duplicateCheck: 'duplicate'
      },
      vehicleAds: { ...readyEvidence.vehicleAds, accountStateScope: 'multi_state' }
    })

    expect(result.ready).toBe(false)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PMAX_BUSINESS_PROFILE_LOCATION_INACTIVE', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_BUSINESS_PROFILE_DUPLICATE', status: 'fail' }),
      expect.objectContaining({ code: 'PMAX_VEHICLE_ADS_MULTI_STATE_ACCOUNT', status: 'fail' })
    ]))
  })
})
