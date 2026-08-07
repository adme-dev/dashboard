export type GooglePmaxOnboardingCheckStatus = 'pass' | 'warning' | 'fail'
export type GooglePmaxOnboardingTaskExecution = 'automatable' | 'assisted' | 'human'

export interface GooglePmaxOnboardingEvidence {
  countryCode: string
  googleAds: {
    customerId: string | null
    status: 'active' | 'inactive' | 'missing'
    adminAccess: boolean
    apiAccess: boolean
  }
  merchant: {
    accountId: string | null
    status: 'active' | 'inactive' | 'missing'
    adminAccess: boolean
    apiAccess: boolean
  }
  businessProfile: {
    accountId: string | null
    locationId: string | null
    storeCode: string | null
    verified: boolean
    apiAccess: boolean
  }
  dealershipLocations: {
    source: 'business_profile' | 'store_data_source'
    storeDataSourceId: string | null
    storeDataSourceStatus: 'active' | 'inactive' | 'missing' | 'not_used'
    storeCodes: readonly string[]
  }
  feed: {
    storeCodes: readonly string[]
    destination: 'VEHICLE_ADS_ONLY' | 'SHOPPING_ADS' | 'FREE_LISTINGS' | 'UNKNOWN'
  }
  links: {
    adsToMerchant: 'active' | 'pending' | 'missing'
    merchantToBusinessProfile: 'active' | 'pending' | 'missing'
  }
  vehicleAds: {
    addon: 'enabled' | 'pending' | 'not_enabled' | 'unavailable'
    dealershipLicenseReview: 'approved' | 'pending' | 'not_started' | 'rejected'
    websiteReview: 'approved' | 'pending' | 'not_started' | 'failed'
  }
}

export interface GooglePmaxOnboardingCheck {
  code: string
  status: GooglePmaxOnboardingCheckStatus
  message: string
}

export interface GooglePmaxOnboardingTask {
  key: string
  title: string
  execution: GooglePmaxOnboardingTaskExecution
  owner: 'platform' | 'google_admin' | 'client'
}

export interface GooglePmaxOnboardingResult {
  ready: boolean
  identities: {
    googleAdsCustomerId: string | null
    merchantCenterAccountId: string | null
    businessProfileAccountId: string | null
    businessProfileLocationId: string | null
    dealershipLocationSource: 'business_profile' | 'store_data_source'
    storeDataSourceId: string | null
    storeCode: string | null
  }
  checks: GooglePmaxOnboardingCheck[]
  tasks: GooglePmaxOnboardingTask[]
}

function check(code: string, status: GooglePmaxOnboardingCheckStatus, message: string): GooglePmaxOnboardingCheck {
  return { code, status, message }
}

function task(
  key: string,
  title: string,
  execution: GooglePmaxOnboardingTaskExecution,
  owner: GooglePmaxOnboardingTask['owner']
): GooglePmaxOnboardingTask {
  return { key, title, execution, owner }
}

function cleanId(value: string | null, digitsOnly = false): string | null {
  if (!value) return null
  const cleaned = digitsOnly ? value.replace(/[\s-]/g, '') : value.trim()
  return cleaned || null
}

export function evaluateGooglePmaxOnboarding(
  evidence: GooglePmaxOnboardingEvidence
): GooglePmaxOnboardingResult {
  const checks: GooglePmaxOnboardingCheck[] = []
  const tasks: GooglePmaxOnboardingTask[] = []
  const googleAdsCustomerId = cleanId(evidence.googleAds.customerId, true)
  const merchantCenterAccountId = cleanId(evidence.merchant.accountId, true)
  const businessProfileAccountId = cleanId(evidence.businessProfile.accountId)
  const businessProfileLocationId = cleanId(evidence.businessProfile.locationId)
  const storeDataSourceId = cleanId(evidence.dealershipLocations.storeDataSourceId)
  const storeCode = evidence.dealershipLocations.source === 'business_profile'
    ? cleanId(evidence.businessProfile.storeCode)
    : cleanId(evidence.dealershipLocations.storeCodes[0] || null)

  if (!googleAdsCustomerId || evidence.googleAds.status !== 'active') {
    checks.push(check('PMAX_GOOGLE_ADS_ACCOUNT_MISSING', 'fail', 'An active Google Ads customer is required.'))
    tasks.push(task('create-google-ads-account', 'Create or select the managed Google Ads customer', 'assisted', 'google_admin'))
  }
  if (!merchantCenterAccountId || evidence.merchant.status !== 'active') {
    checks.push(check('PMAX_MERCHANT_ACCOUNT_MISSING', 'fail', 'An active Merchant Center account is required.'))
    tasks.push(task('create-merchant-center-account', 'Create or select the Merchant Center account', 'assisted', 'google_admin'))
  }
  if (!businessProfileAccountId) {
    checks.push(check('PMAX_BUSINESS_PROFILE_ACCOUNT_MISSING', 'fail', 'A linked Google Business Profile account is required.'))
    tasks.push(task('create-business-profile-account', 'Create or claim the dealership Business Profile account', 'assisted', 'client'))
  }
  if (evidence.dealershipLocations.source === 'business_profile' && !businessProfileLocationId) {
    checks.push(check('PMAX_BUSINESS_PROFILE_LOCATION_MISSING', 'fail', 'A dealership Business Profile location is required for this location source.'))
    tasks.push(task('create-business-profile-location', 'Create or claim the dealership Business Profile location', 'assisted', 'client'))
  }
  if (
    evidence.dealershipLocations.source === 'store_data_source'
    && (!storeDataSourceId || evidence.dealershipLocations.storeDataSourceStatus !== 'active')
  ) {
    checks.push(check('PMAX_STORE_DATA_SOURCE_MISSING', 'fail', 'An active dealership store data source is required for this location source.'))
    tasks.push(task('create-dealership-store-data-source', 'Create and validate the Merchant dealership store data source', 'assisted', 'google_admin'))
  }
  if (evidence.dealershipLocations.source === 'business_profile' && !evidence.businessProfile.verified) {
    checks.push(check('PMAX_BUSINESS_PROFILE_UNVERIFIED', 'fail', 'The dealership Business Profile location is not verified.'))
    tasks.push(task('verify-business-profile-location', 'Complete Google Business Profile location verification', 'human', 'client'))
  }

  if (evidence.links.adsToMerchant !== 'active') {
    checks.push(check('PMAX_ADS_MERCHANT_LINK_MISSING', 'fail', 'Google Ads and Merchant Center are not actively linked.'))
    const directLinkAllowed = Boolean(
      googleAdsCustomerId
      && merchantCenterAccountId
      && evidence.googleAds.adminAccess
      && evidence.merchant.adminAccess
      && evidence.googleAds.apiAccess
      && evidence.merchant.apiAccess
    )
    tasks.push(directLinkAllowed
      ? task('link-google-ads-merchant-center', 'Create the direct Google Ads–Merchant Center link', 'automatable', 'platform')
      : task('approve-google-ads-merchant-link', 'Send and approve the Google Ads–Merchant Center link request', 'human', 'google_admin'))
  }

  if (evidence.links.merchantToBusinessProfile !== 'active') {
    checks.push(check('PMAX_MERCHANT_BUSINESS_PROFILE_LINK_MISSING', 'fail', 'Merchant Center and Business Profile are not actively linked.'))
    const apiAssisted = evidence.merchant.adminAccess
      && evidence.merchant.apiAccess
      && evidence.businessProfile.apiAccess
    tasks.push(task(
      'link-merchant-business-profile',
      'Link the dealership Business Profile to Merchant Center',
      apiAssisted ? 'assisted' : 'human',
      apiAssisted ? 'platform' : 'google_admin'
    ))
  }

  const matchingStoreCode = evidence.dealershipLocations.source === 'business_profile'
    ? Boolean(storeCode && evidence.feed.storeCodes.includes(storeCode))
    : Boolean(
        evidence.feed.storeCodes.length
        && evidence.feed.storeCodes.every(code => evidence.dealershipLocations.storeCodes.includes(code))
      )
  if (!matchingStoreCode) {
    checks.push(check('PMAX_STORE_CODE_MISMATCH', 'fail', 'The case-sensitive vehicle feed store code does not match the Business Profile location.'))
    tasks.push(task('reconcile-vehicle-store-code', 'Reconcile the feed and dealership location store codes', 'assisted', 'platform'))
  }
  if (evidence.feed.destination !== 'VEHICLE_ADS_ONLY') {
    checks.push(check('PMAX_FEED_DESTINATION_INVALID', 'fail', 'The vehicle data source must target Vehicle Ads only.'))
    tasks.push(task('set-vehicle-ads-feed-destination', 'Set the Merchant vehicle source destination to Vehicle Ads only', 'assisted', 'google_admin'))
  }

  if (evidence.vehicleAds.addon !== 'enabled') {
    checks.push(check('PMAX_VEHICLE_ADS_ADDON_NOT_ENABLED', 'fail', 'The Vehicle Ads add-on is not enabled.'))
    tasks.push(task('enable-vehicle-ads-addon', 'Enable the Vehicle Ads add-on in Merchant Center', 'human', 'google_admin'))
  }
  if (evidence.vehicleAds.dealershipLicenseReview !== 'approved') {
    checks.push(check('PMAX_DEALERSHIP_LICENSE_REVIEW_PENDING', 'fail', 'Google has not approved the dealership licence review.'))
    tasks.push(task('complete-dealership-license-review', 'Submit and complete Google dealership licence review', 'human', 'client'))
  }
  if (evidence.vehicleAds.websiteReview !== 'approved') {
    checks.push(check('PMAX_VEHICLE_WEBSITE_REVIEW_PENDING', 'fail', 'Google has not approved the Vehicle Ads website review.'))
    tasks.push(task('complete-vehicle-website-review', 'Complete the Google Vehicle Ads website review', 'human', 'client'))
  }

  if (evidence.countryCode.trim().toUpperCase() !== 'AU') {
    checks.push(check('PMAX_VEHICLE_ADS_COUNTRY_REVIEW_REQUIRED', 'fail', 'Vehicle Ads availability and onboarding differ outside Australia.'))
    tasks.push(task('confirm-vehicle-ads-country-availability', 'Confirm Vehicle Ads availability for the target country', 'human', 'google_admin'))
  }

  const ready = checks.every(item => item.status !== 'fail')
  if (ready) {
    checks.push(check('PMAX_ONBOARDING_READY', 'pass', 'Google Ads, Merchant Center, Business Profile, store code, and Vehicle Ads reviews are ready.'))
  }

  return {
    ready,
    identities: {
      googleAdsCustomerId,
      merchantCenterAccountId,
      businessProfileAccountId,
      businessProfileLocationId,
      dealershipLocationSource: evidence.dealershipLocations.source,
      storeDataSourceId,
      storeCode
    },
    checks,
    tasks
  }
}
