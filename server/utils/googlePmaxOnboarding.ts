export type GooglePmaxOnboardingCheckStatus = 'pass' | 'warning' | 'fail'
export type GooglePmaxOnboardingTaskExecution = 'automatable' | 'assisted' | 'human'

export interface GooglePmaxOnboardingEvidence {
  countryCode: string
  platform: {
    googleCloudProjectId: string | null
    oauth: {
      clientConfigured: boolean
      consentScreenConfigured: boolean
      offlineAccessGranted: boolean
      googleAdsScopeGranted: boolean
      merchantScopeGranted: boolean
      businessProfileScopeGranted: boolean
    }
    googleAdsApi: {
      enabled: boolean
      developerTokenAccess: 'standard' | 'basic' | 'explorer' | 'test' | 'pending' | 'missing'
    }
    merchantApi: {
      enabled: boolean
      createAndConfigureAccess: boolean
      providerAccountId: string | null
    }
    businessProfileApis: {
      enabled: boolean
      access: 'approved' | 'pending' | 'not_requested' | 'rejected'
    }
  }
  googleAds: {
    customerId: string | null
    managerCustomerId: string | null
    status: 'active' | 'inactive' | 'missing'
    adminAccess: boolean
    apiAccess: boolean
    clientAccountCreationEligible: boolean
    currencyCode: string | null
    timeZone: string | null
    billingStatus: 'active' | 'pending' | 'missing'
    policyStatus: 'clear' | 'under_review' | 'restricted' | 'suspended' | 'unknown'
  }
  merchant: {
    accountId: string | null
    status: 'active' | 'inactive' | 'missing'
    adminAccess: boolean
    apiAccess: boolean
    clientAdminPresent: boolean
    termsOfService: 'accepted' | 'not_accepted' | 'unknown'
    businessInformation: 'complete' | 'incomplete' | 'missing'
    homepage: 'claimed' | 'verified' | 'unverified' | 'conflict' | 'missing'
  }
  businessProfile: {
    accountId: string | null
    locationId: string | null
    storeCode: string | null
    verified: boolean
    apiAccess: boolean
    accessRole: 'owner' | 'manager' | 'none'
    locationStatus: 'active' | 'temporarily_closed' | 'permanently_closed' | 'missing'
    duplicateCheck: 'clear' | 'possible' | 'duplicate' | 'unknown'
    physicalStoreConfirmed: boolean
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
    accountStateScope: 'single_state' | 'multi_state' | 'unknown'
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
  shopIdentity: {
    kind: 'business_profile_location_and_store_code' | 'merchant_store_data_source_and_store_code'
    locationResourceName: string | null
    storeCode: string | null
  }
  apiCapabilities: {
    readGoogleAds: boolean
    createGoogleAdsClient: boolean
    directLinkAdsMerchant: boolean
    readMerchant: boolean
    createMerchantAccount: boolean
    linkMerchantBusinessProfile: boolean
    discoverBusinessProfileLocation: boolean
    createBusinessProfileLocation: boolean
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
  const managerCustomerId = cleanId(evidence.googleAds.managerCustomerId, true)
  const providerAccountId = cleanId(evidence.platform.merchantApi.providerAccountId)
  const oauthReady = evidence.platform.oauth.clientConfigured
    && evidence.platform.oauth.consentScreenConfigured
    && evidence.platform.oauth.offlineAccessGranted
  const developerTokenReady = ['standard', 'basic', 'explorer'].includes(evidence.platform.googleAdsApi.developerTokenAccess)
  const googleAdsPlatformReady = oauthReady
    && evidence.platform.oauth.googleAdsScopeGranted
    && evidence.platform.googleAdsApi.enabled
    && developerTokenReady
  const merchantPlatformReady = oauthReady
    && evidence.platform.oauth.merchantScopeGranted
    && evidence.platform.merchantApi.enabled
  const discoverBusinessProfileLocation = oauthReady
    && evidence.platform.oauth.businessProfileScopeGranted
    && evidence.platform.businessProfileApis.enabled
    && evidence.platform.businessProfileApis.access === 'approved'
  const apiCapabilities: GooglePmaxOnboardingResult['apiCapabilities'] = {
    readGoogleAds: Boolean(googleAdsPlatformReady && googleAdsCustomerId && evidence.googleAds.apiAccess),
    createGoogleAdsClient: Boolean(googleAdsPlatformReady && managerCustomerId && evidence.googleAds.clientAccountCreationEligible),
    directLinkAdsMerchant: Boolean(
      googleAdsPlatformReady
      && googleAdsCustomerId
      && merchantCenterAccountId
      && evidence.googleAds.apiAccess
      && evidence.googleAds.adminAccess
      && evidence.merchant.adminAccess
    ),
    readMerchant: Boolean(merchantPlatformReady && merchantCenterAccountId && evidence.merchant.apiAccess),
    createMerchantAccount: Boolean(
      merchantPlatformReady
      && evidence.platform.merchantApi.createAndConfigureAccess
      && providerAccountId
    ),
    linkMerchantBusinessProfile: Boolean(
      merchantPlatformReady
      && evidence.merchant.adminAccess
      && evidence.merchant.apiAccess
      && businessProfileAccountId
      && evidence.businessProfile.accessRole !== 'none'
    ),
    discoverBusinessProfileLocation,
    createBusinessProfileLocation: Boolean(
      discoverBusinessProfileLocation
      && businessProfileAccountId
      && evidence.businessProfile.apiAccess
      && evidence.businessProfile.accessRole !== 'none'
      && evidence.businessProfile.duplicateCheck === 'clear'
      && evidence.businessProfile.physicalStoreConfirmed
    )
  }

  if (!cleanId(evidence.platform.googleCloudProjectId)) {
    checks.push(check('PMAX_GOOGLE_CLOUD_PROJECT_MISSING', 'fail', 'A governed Google Cloud project is required for Google API credentials and audit ownership.'))
    tasks.push(task('configure-google-cloud-project', 'Create or select the governed Google Cloud project', 'assisted', 'platform'))
  }
  if (!oauthReady) {
    checks.push(check('PMAX_GOOGLE_OAUTH_NOT_READY', 'fail', 'Google OAuth client, consent configuration, and offline access are required.'))
    tasks.push(task('configure-google-oauth', 'Configure the Google OAuth client, consent screen, and encrypted offline token flow', 'assisted', 'platform'))
  }
  if (!evidence.platform.googleAdsApi.enabled) {
    checks.push(check('PMAX_GOOGLE_ADS_API_DISABLED', 'fail', 'The Google Ads API is not enabled for the platform project.'))
    tasks.push(task('enable-google-ads-api', 'Enable and validate the Google Ads API', 'assisted', 'platform'))
  }
  if (!developerTokenReady) {
    checks.push(check('PMAX_GOOGLE_ADS_DEVELOPER_TOKEN_NOT_READY', 'fail', 'The Google Ads developer token cannot operate on the required production account.'))
    tasks.push(task('obtain-google-ads-developer-token', 'Obtain production-capable Google Ads developer-token access', 'human', 'platform'))
  }
  if (!evidence.platform.oauth.googleAdsScopeGranted) {
    checks.push(check('PMAX_GOOGLE_ADS_OAUTH_SCOPE_MISSING', 'fail', 'The connected operator has not granted the Google Ads OAuth scope.'))
    tasks.push(task('authorize-google-ads-scope', 'Reconnect Google and grant the Google Ads scope', 'human', 'google_admin'))
  }
  if (!evidence.platform.merchantApi.enabled) {
    checks.push(check('PMAX_MERCHANT_API_DISABLED', 'fail', 'The Merchant API is not enabled for the platform project.'))
    tasks.push(task('enable-merchant-api', 'Enable and validate the Merchant API', 'assisted', 'platform'))
  }
  if (!evidence.platform.oauth.merchantScopeGranted) {
    checks.push(check('PMAX_MERCHANT_OAUTH_SCOPE_MISSING', 'fail', 'The connected operator has not granted Merchant access.'))
    tasks.push(task('authorize-merchant-scope', 'Reconnect Google and grant the Merchant scope', 'human', 'google_admin'))
  }
  if (!discoverBusinessProfileLocation) {
    checks.push(check('PMAX_BUSINESS_PROFILE_API_NOT_READY', 'fail', 'Business Profile API project approval, enabled services, and delegated OAuth access are required for governed location readback.'))
    tasks.push(evidence.platform.businessProfileApis.access === 'not_requested'
      ? task('request-business-profile-api-access', 'Request Google Business Profile API access for the governed Cloud project', 'human', 'platform')
      : task('restore-business-profile-api-access', 'Restore Business Profile API approval, enabled services, and OAuth access', 'assisted', 'platform'))
  }

  if (!googleAdsCustomerId || evidence.googleAds.status !== 'active') {
    checks.push(check('PMAX_GOOGLE_ADS_ACCOUNT_MISSING', 'fail', 'An active Google Ads customer is required.'))
    tasks.push(task(
      'create-google-ads-account',
      'Create or select the managed Google Ads customer',
      apiCapabilities.createGoogleAdsClient ? 'automatable' : 'assisted',
      apiCapabilities.createGoogleAdsClient ? 'platform' : 'google_admin'
    ))
  }
  if (!managerCustomerId) {
    checks.push(check('PMAX_GOOGLE_ADS_MANAGER_MISSING', 'fail', 'A Google Ads manager customer is required for governed account administration and API access.'))
    tasks.push(task('select-google-ads-manager', 'Select or link the agency Google Ads manager account', 'human', 'google_admin'))
  }
  if (!cleanId(evidence.googleAds.currencyCode) || !cleanId(evidence.googleAds.timeZone)) {
    checks.push(check('PMAX_GOOGLE_ADS_IMMUTABLE_SETTINGS_MISSING', 'fail', 'Google Ads currency and time zone must be approved before creating a client account.'))
    tasks.push(task('choose-google-ads-currency-timezone', 'Approve the Google Ads currency and time zone before account creation', 'human', 'client'))
  }
  if (evidence.googleAds.billingStatus !== 'active') {
    checks.push(check('PMAX_GOOGLE_ADS_BILLING_NOT_ACTIVE', 'fail', 'Google Ads billing is not active.'))
    tasks.push(task('configure-google-ads-billing', 'Configure and approve the Google Ads payments and billing setup', 'human', 'google_admin'))
  }
  if (evidence.googleAds.policyStatus !== 'clear') {
    checks.push(check('PMAX_GOOGLE_ADS_POLICY_NOT_CLEAR', 'fail', 'The Google Ads customer has an unresolved policy, restriction, or review state.'))
    tasks.push(task('resolve-google-ads-account-policy', 'Resolve the Google Ads account policy or review state', 'human', 'google_admin'))
  }
  if (!merchantCenterAccountId || evidence.merchant.status !== 'active') {
    checks.push(check('PMAX_MERCHANT_ACCOUNT_MISSING', 'fail', 'An active Merchant Center account is required.'))
    tasks.push(task(
      'create-merchant-center-account',
      'Create or select the Merchant Center account',
      apiCapabilities.createMerchantAccount ? 'automatable' : 'assisted',
      apiCapabilities.createMerchantAccount ? 'platform' : 'google_admin'
    ))
  }
  if (!evidence.merchant.clientAdminPresent) {
    checks.push(check('PMAX_MERCHANT_CLIENT_ADMIN_MISSING', 'fail', 'The client must retain an administrator identity on the Merchant Center account.'))
    tasks.push(task('add-merchant-client-admin', 'Add and verify a client administrator in Merchant Center', 'human', 'client'))
  }
  if (evidence.merchant.termsOfService !== 'accepted') {
    checks.push(check('PMAX_MERCHANT_TERMS_NOT_ACCEPTED', 'fail', 'The applicable Merchant Center terms have not been accepted by the merchant.'))
    tasks.push(task('accept-merchant-terms', 'Review and accept the Merchant Center terms for the business', 'human', 'client'))
  }
  if (evidence.merchant.businessInformation !== 'complete') {
    checks.push(check('PMAX_MERCHANT_BUSINESS_INFO_INCOMPLETE', 'fail', 'Merchant Center business information is incomplete.'))
    tasks.push(task('complete-merchant-business-information', 'Complete Merchant Center business identity and address information', 'assisted', 'platform'))
  }
  if (evidence.merchant.homepage !== 'claimed') {
    checks.push(check('PMAX_MERCHANT_HOMEPAGE_NOT_CLAIMED', 'fail', 'The dealership website is not verified and claimed in Merchant Center.'))
    tasks.push(task('claim-merchant-homepage', 'Set, verify, and claim the dealership homepage in Merchant Center', 'assisted', 'platform'))
  }
  if (!businessProfileAccountId) {
    checks.push(check('PMAX_BUSINESS_PROFILE_ACCOUNT_MISSING', 'fail', 'A linked Google Business Profile account is required.'))
    tasks.push(task('create-business-profile-account', 'Create or claim the dealership Business Profile account', 'human', 'client'))
  }
  if (evidence.dealershipLocations.source === 'business_profile' && !businessProfileLocationId) {
    checks.push(check('PMAX_BUSINESS_PROFILE_LOCATION_MISSING', 'fail', 'A dealership Business Profile location is required for this location source.'))
    tasks.push(task('create-business-profile-location', 'Create or claim the dealership Business Profile location', 'assisted', 'client'))
  }
  if (evidence.dealershipLocations.source === 'business_profile' && evidence.businessProfile.accessRole === 'none') {
    checks.push(check('PMAX_BUSINESS_PROFILE_ACCESS_MISSING', 'fail', 'The connected operator does not own or manage the dealership Business Profile.'))
    tasks.push(task('claim-business-profile-access', 'Request or claim owner or manager access to the dealership Business Profile', 'human', 'client'))
  }
  if (
    evidence.dealershipLocations.source === 'business_profile'
    && !['active', 'temporarily_closed'].includes(evidence.businessProfile.locationStatus)
  ) {
    checks.push(check('PMAX_BUSINESS_PROFILE_LOCATION_INACTIVE', 'fail', 'The Business Profile location is missing or permanently closed.'))
    tasks.push(task('restore-business-profile-location', 'Create, reopen, or select the active dealership Business Profile location', 'human', 'client'))
  }
  if (evidence.dealershipLocations.source === 'business_profile' && evidence.businessProfile.duplicateCheck !== 'clear') {
    checks.push(check('PMAX_BUSINESS_PROFILE_DUPLICATE', 'fail', 'A possible duplicate Business Profile must be resolved before creating or binding a location.'))
    tasks.push(task('resolve-business-profile-duplicate', 'Search for and resolve duplicate dealership Business Profiles before creation', 'human', 'client'))
  }
  if (!evidence.businessProfile.physicalStoreConfirmed) {
    checks.push(check('PMAX_PHYSICAL_DEALERSHIP_NOT_CONFIRMED', 'fail', 'Vehicle Ads require a confirmed brick-and-mortar dealership location.'))
    tasks.push(task('confirm-physical-dealership', 'Confirm the physical dealership address and customer access', 'human', 'client'))
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
    tasks.push(apiCapabilities.directLinkAdsMerchant
      ? task('link-google-ads-merchant-center', 'Create the direct Google Ads–Merchant Center link', 'automatable', 'platform')
      : task('approve-google-ads-merchant-link', 'Send and approve the Google Ads–Merchant Center link request', 'human', 'google_admin'))
  }

  if (evidence.links.merchantToBusinessProfile !== 'active') {
    checks.push(check('PMAX_MERCHANT_BUSINESS_PROFILE_LINK_MISSING', 'fail', 'Merchant Center and Business Profile are not actively linked.'))
    const apiAssisted = apiCapabilities.linkMerchantBusinessProfile
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
    const storeSource = evidence.dealershipLocations.source === 'business_profile'
      ? 'Business Profile location'
      : 'Merchant dealership store data source'
    checks.push(check('PMAX_STORE_CODE_MISMATCH', 'fail', `The case-sensitive vehicle feed store code does not match the ${storeSource}.`))
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
  if (evidence.vehicleAds.accountStateScope !== 'single_state') {
    checks.push(check('PMAX_VEHICLE_ADS_MULTI_STATE_ACCOUNT', 'fail', 'A Vehicle Ads Merchant Center account must contain vehicle inventory for only one state.'))
    tasks.push(task('separate-vehicle-ads-state-accounts', 'Confirm the dealership state and separate multi-state vehicle inventory into governed Merchant accounts', 'human', 'google_admin'))
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
    shopIdentity: {
      kind: evidence.dealershipLocations.source === 'business_profile'
        ? 'business_profile_location_and_store_code'
        : 'merchant_store_data_source_and_store_code',
      locationResourceName: evidence.dealershipLocations.source === 'business_profile'
        ? businessProfileLocationId
        : null,
      storeCode
    },
    apiCapabilities,
    checks,
    tasks
  }
}
