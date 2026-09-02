import type { MeasurementPlatform } from '~~/shared/utils/measurementPlatform'

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
  desiredEnabled: boolean
  desiredStateSource: 'new_client_default' | 'existing_review' | 'operator' | 'explicit_opt_out'
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
  approvals: {
    privacy: boolean
    live: boolean
  }
  profile: {
    desiredEnabled: boolean
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
  /** Derived from the shared source of truth so a new platform can never go stale here. */
  platform: MeasurementPlatform
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

export interface PortalMeasurementSignalSummary {
  status: MeasurementCapabilityStatus
  owners: Array<'zero' | 'gtm' | 'partner' | 'external'>
  lastEvidenceAt: string | null
}

export interface PortalMeasurementHealth {
  status: 'onboarding' | 'paused' | 'degraded' | 'healthy'
  statusMessage: string
  deliveryState: 'dormant' | MeasurementEnvironment
  authority: {
    source: string
    lastSyncAt: string | null
    acceptedOutcomeCount: number
    rejectedOutcomeCount: number
  }
  signals: {
    browser: PortalMeasurementSignalSummary
    server: PortalMeasurementSignalSummary
    crm: PortalMeasurementSignalSummary
  }
  eventIdentity: Array<{
    canonicalEventName: string
    mode: 'browser_server_dedup' | 'server_only'
    label: string
  }>
  destinations: Array<{
    platform: MeasurementDestination['platform']
    label: string
    status: MeasurementCapabilityStatus
    deliveryState: 'dormant' | MeasurementEnvironment
    lastSuccessAt: string | null
  }>
  delivery: {
    acceptedCount: number
    deliveredCount: number
    rejectedCount: number
    pendingCount: number
    lastAcceptedAt: string | null
    lastDeliveredAt: string | null
    lastRejectedAt: string | null
  }
  lastValidatedAt: string | null
  nextSteps: string[]
}
