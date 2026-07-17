export type MeasurementEnvironment = 'test' | 'live' | 'paused'
export type MeasurementReadinessStatus = 'onboarding' | 'paused' | 'blocked' | 'degraded' | 'ready'
export type MeasurementCapabilityStatus
  = | 'not_configured'
    | 'detected'
    | 'configured'
    | 'validating'
    | 'ready'
    | 'degraded'
    | 'blocked'

export interface ClientMeasurementProfile {
  id: string
  clientId: string
  enabled: boolean
  environment: MeasurementEnvironment
  collectionTier: 'cloudflare_owned' | 'first_party_cname' | 'shared_endpoint' | 'backend_only'
  trackingSiteId: string | null
  firstPartyHostname: string | null
  hostnameStatus: 'not_required' | 'pending' | 'active' | 'error'
  consentMode: 'off' | 'au_optout' | 'consent_gated'
  vertical: string
  outcomeAuthority: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
  nativeLifecycleMode: 'crm_preferred' | 'leads_only'
  portalOutcomeMode: 'disabled' | 'propose' | 'authoritative'
  configVersion: number
  cacheStatus: 'not_published' | 'fresh' | 'stale' | 'error'
  cacheVersion: number | null
  cacheErrorClass: string | null
  createdAt: string
  updatedAt: string
}

export interface MeasurementReadinessSummary {
  clientId: string
  profileId: string
  configVersion: number
  status: MeasurementReadinessStatus
  liveEligible: boolean
  profile: {
    enabled: boolean
    environment: MeasurementEnvironment
    cacheStatus: ClientMeasurementProfile['cacheStatus']
    outcomeAuthority: ClientMeasurementProfile['outcomeAuthority']
  }
  counts: {
    destinations: number
    readyDestinations: number
    degradedDestinations: number
    blockedDestinations: number
    capabilities: number
    readyCapabilities: number
    degradedCapabilities: number
    blockedCapabilities: number
    activeMappings: number
    outcomeEndpoints: number
    readyOutcomeEndpoints: number
  }
  blockers: Array<{ code: string, message: string }>
  lastValidatedAt: string | null
  lastSuccessAt: string | null
}

export interface MeasurementCapability {
  id: string
  mode: string
  status: MeasurementCapabilityStatus
  managementOrigin: 'zero' | 'gtm' | 'partner' | 'external'
  canZeroMutate: boolean
  evidenceAt: string | null
  blockingReason: string | null
}

export interface MeasurementEventMapping {
  id: string
  canonicalEventName: string
  providerEventName: string
  isActive: boolean
}

export interface MeasurementDestination {
  id: string
  platform: 'meta' | 'google_data_manager'
  socialConnectionId?: string | null
  externalDestinationId: string
  credentialConfigured: boolean
  enabled: boolean
  environment: MeasurementEnvironment
  healthStatus: MeasurementCapabilityStatus
  configVersion: number
  lastValidatedAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  providerRequestId: string | null
  errorClass: string | null
  redactedError: string | null
  capabilities: MeasurementCapability[]
  mappings: MeasurementEventMapping[]
}

export interface MeasurementAuditEntry {
  id: string
  entityType: string
  action: string
  configVersion: number
  changedFields: string[]
  actorType: string
  actorId: string | null
  reason: string
  requestId: string | null
  createdAt: string
}

export interface PaginatedMeasurementResponse<T> {
  items: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}
