export interface GooglePmaxInventoryLaunchConfig {
  schemaVersion: 2
  briefId: string
  briefVersion: number
  tenantId: string
  clientId: string
  connectionId: string
  customerId: string
  campaignName: string
  budget: {
    currency: string
    period: 'CUSTOM_PERIOD'
    startDate: string
    endDate: string
    campaignDays: number
    allocatedTotal: number
    dailyBudget: null
    calculatedDailyPace: number
    provider: {
      totalAmountMicros: string
      amountMicros: null
    }
  }
  bidding: {
    strategy: 'MAXIMIZE_CONVERSIONS' | 'MAXIMIZE_CONVERSION_VALUE'
    targetCpaMicros?: string
    targetRoas?: number
  }
  schedule: { startDate: string, endDate: string }
  locations: Array<{ criterionId: string, displayName: string }>
  languages: string[]
  finalUrls: string[]
  merchantCenterId: string
  inventorySource: {
    providerId: 'social-dashboard'
    linkId: string
    feedId: string
    platform: 'google'
  }
  inventoryFilter: {
    listingSource: 'SHOPPING'
    conditions: Array<'NEW' | 'USED'>
  }
  assetGroup: {
    mode: 'MERCHANT_ONLY' | 'PROVIDED'
    name: string
    businessName: string
    headlines: string[]
    longHeadlines: string[]
    descriptions: string[]
    imageAssetResourceNames: string[]
    logoAssetResourceNames: string[]
    youtubeVideoAssetResourceNames: string[]
  }
  conversionGoals: Array<{
    conversionActionId: string
    resourceName: string
    category: string
    origin: string
  }>
  approval: {
    required: true
    complianceAcknowledged: boolean
  }
}

export interface GooglePmaxProviderResources {
  customerId: string
  campaignResourceName: string
  campaignId: string
  budgetResourceName: string
  assetGroupResourceName: string
  status: 'PAUSED' | 'ENABLED'
  requestId: string | null
}

export interface GooglePmaxProviderVerification {
  status: 'PAUSED' | 'ENABLED' | 'REMOVED' | 'UNKNOWN'
  matchesConfig: boolean
  requestId: string | null
  details: Record<string, unknown>
}

export interface GooglePmaxProviderConnection {
  id: string
  clientId: string
  status: 'active' | 'inactive' | 'error'
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

export interface GooglePmaxPreflightEvidence {
  providerRequestId: string | null
  connection: {
    id: string
    clientId: string
    status: 'active' | 'inactive' | 'error'
    customerId: string
    currency: string
    timezone: string
  }
  merchant: {
    linkedMerchantCenterIds: string[]
    sourceStatus: 'healthy' | 'warning' | 'error'
    eligibleItemCount: number
    vehicleItemCount: number
    disapprovedItemCount: number
  }
  internalFeed: {
    linkId: string
    feedId: string
    platform: 'google' | 'facebook'
    status: 'ready' | 'partial' | 'blocked' | 'empty' | 'unknown'
    matchedItemCount: number
    validatedItemCount: number
    invalidItemCount: number
    conditions: Array<'NEW' | 'USED'>
    fetchedAt: string
  }
  conversions: Array<{
    conversionActionId: string
    resourceName: string
    status: 'ENABLED' | 'REMOVED' | 'HIDDEN'
    primaryForGoal: boolean
    includeInConversionsMetric: boolean
    recentConversions: boolean
  }>
  assets: {
    mode: 'merchant_only' | 'provided'
    textCoverageComplete: boolean
    mediaCoverageComplete: boolean
    allApproved: boolean
  }
  destinations: { allFinalUrlsVerified: boolean }
}

export interface GooglePmaxPreflightCheck {
  code: string
  category: 'account' | 'budget' | 'inventory' | 'merchant' | 'conversion' | 'targeting' | 'assets' | 'destination' | 'provider'
  status: 'pass' | 'warning' | 'fail'
  message: string
  remediation: string | null
}

export interface GooglePmaxPreflightResult {
  ready: boolean
  blockerCount: number
  warningCount: number
  providerRequestId: string | null
  checkedAt: string
  checks: GooglePmaxPreflightCheck[]
}

export interface GooglePmaxPausedProvider {
  validateCreate: (config: GooglePmaxInventoryLaunchConfig) => Promise<{ requestId: string | null }>
  createPaused: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxProviderResources>
  verify: (
    config: GooglePmaxInventoryLaunchConfig,
    resources: GooglePmaxProviderResources,
    expectedStatus: 'PAUSED' | 'ENABLED'
  ) => Promise<GooglePmaxProviderVerification>
  emergencyPause: (
    resources: GooglePmaxProviderResources,
    config: GooglePmaxInventoryLaunchConfig
  ) => Promise<{ status: 'PAUSED' | 'ENABLED' | 'UNKNOWN', requestId: string | null }>
  enable: (
    resources: GooglePmaxProviderResources,
    config: GooglePmaxInventoryLaunchConfig
  ) => Promise<{ status: 'PAUSED' | 'ENABLED' | 'UNKNOWN', requestId: string | null }>
}
