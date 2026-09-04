import { z } from 'zod'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'

const PortalCapabilityStatusSchema = z.enum([
  'not_configured',
  'detected',
  'configured',
  'validating',
  'ready',
  'degraded',
  'blocked'
])

export const PortalMeasurementHealthSchema = z.strictObject({
  status: z.enum(['onboarding', 'paused', 'degraded', 'healthy']),
  statusMessage: z.string().min(1).max(500),
  deliveryState: z.enum(['dormant', 'test', 'live', 'paused']),
  authority: z.strictObject({
    source: z.string().min(1).max(100),
    lastSyncAt: z.string().datetime({ offset: true }).nullable(),
    acceptedOutcomeCount: z.number().int().nonnegative(),
    rejectedOutcomeCount: z.number().int().nonnegative()
  }),
  signals: z.strictObject({
    browser: z.strictObject({
      status: PortalCapabilityStatusSchema,
      owners: z.array(z.enum(['zero', 'gtm', 'partner', 'external'])),
      lastEvidenceAt: z.string().datetime({ offset: true }).nullable()
    }),
    server: z.strictObject({
      status: PortalCapabilityStatusSchema,
      owners: z.array(z.enum(['zero', 'gtm', 'partner', 'external'])),
      lastEvidenceAt: z.string().datetime({ offset: true }).nullable()
    }),
    crm: z.strictObject({
      status: PortalCapabilityStatusSchema,
      owners: z.array(z.enum(['zero', 'gtm', 'partner', 'external'])),
      lastEvidenceAt: z.string().datetime({ offset: true }).nullable()
    })
  }),
  eventIdentity: z.array(z.strictObject({
    canonicalEventName: z.string().min(1).max(100),
    mode: z.enum(['browser_server_dedup', 'server_only']),
    label: z.string().min(1).max(100)
  })).max(20),
  destinations: z.array(z.strictObject({
    platform: z.enum(['meta', 'google_data_manager', 'ga4', 'tiktok']),
    label: z.string().min(1).max(100),
    status: PortalCapabilityStatusSchema,
    deliveryState: z.enum(['dormant', 'test', 'live', 'paused']),
    lastSuccessAt: z.string().datetime({ offset: true }).nullable()
  })),
  delivery: z.strictObject({
    acceptedCount: z.number().int().nonnegative(),
    deliveredCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    lastAcceptedAt: z.string().datetime({ offset: true }).nullable(),
    lastDeliveredAt: z.string().datetime({ offset: true }).nullable(),
    lastRejectedAt: z.string().datetime({ offset: true }).nullable()
  }),
  funnel: z.strictObject({
    visits: z.number().int().nonnegative(),
    confirmedLeads: z.number().int().nonnegative()
  }),
  freshness: z.strictObject({
    lastCollectionAt: z.string().datetime({ offset: true }).nullable(),
    lastDeliveryAt: z.string().datetime({ offset: true }).nullable()
  }),
  lastValidatedAt: z.string().datetime({ offset: true }).nullable(),
  nextSteps: z.array(z.string().min(1).max(300)).max(10)
})

type CapabilityStatus = z.infer<typeof PortalCapabilityStatusSchema>
type ManagementOrigin = 'zero' | 'gtm' | 'partner' | 'external'

interface PortalProfileInput {
  enabled: boolean
  environment: 'test' | 'live' | 'paused'
  collectionTier: 'cloudflare_owned' | 'first_party_cname' | 'shared_endpoint' | 'backend_only'
  consentMode: 'off' | 'au_optout' | 'consent_gated'
  outcomeAuthority: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
}

interface PortalReadinessInput {
  status: 'onboarding' | 'paused' | 'blocked' | 'degraded' | 'ready'
  liveEligible: boolean
  blockers: Array<{ code: string, message: string }>
  lastValidatedAt: string | null
}

interface PortalCapabilityInput {
  mode: string
  status: CapabilityStatus
  managementOrigin: ManagementOrigin
  evidenceAt?: string | null
}

interface PortalDestinationInput {
  platform: 'meta' | 'google_data_manager' | 'ga4' | 'tiktok'
  enabled: boolean
  environment: 'test' | 'live' | 'paused'
  healthStatus: CapabilityStatus
  lastSuccessAt?: string | null
  capabilities: PortalCapabilityInput[]
  mappings: Array<{ isActive: boolean, canonicalEventName?: string }>
}

export interface PortalMeasurementAggregateRow {
  accepted_count?: number | string | null
  delivered_count?: number | string | null
  rejected_count?: number | string | null
  recent_rejected_count?: number | string | null
  pending_count?: number | string | null
  last_accepted_at?: Date | string | null
  last_delivered_at?: Date | string | null
  last_rejected_at?: Date | string | null
  outcome_accepted_count?: number | string | null
  outcome_rejected_count?: number | string | null
  last_outcome_sync_at?: Date | string | null
  last_endpoint_received_at?: Date | string | null
  visit_count?: number | string | null
  confirmed_lead_count?: number | string | null
  last_collection_at?: Date | string | null
  last_delivery_at?: Date | string | null
}

const STATUS_PRIORITY: Record<CapabilityStatus, number> = {
  blocked: 7,
  degraded: 6,
  not_configured: 5,
  detected: 4,
  configured: 3,
  validating: 2,
  ready: 1
}

const BROWSER_MODES = new Set([
  'meta_pixel',
  'google_tag_enhanced_conversions',
  'tiktok_pixel'
])
const SERVER_MODES = new Set([
  'meta_web_capi',
  'google_data_manager',
  'ga4_measurement_protocol',
  'tiktok_events_api'
])
const CRM_MODES = new Set([
  'meta_crm_capi',
  'meta_conversion_leads',
  'google_enhanced_conversions_for_leads'
])

const NEXT_STEP_BY_BLOCKER: Record<string, string> = {
  profile_disabled: 'Measurement delivery is not enabled yet.',
  profile_paused: 'Measurement delivery is currently paused.',
  cache_stale: 'Configuration publication needs agency attention.',
  no_destinations: 'Your agency is mapping the conversion destinations.',
  destination_not_ready: 'One or more provider destinations still needs validation.',
  capability_not_ready: 'One or more tracking capabilities still needs validation.',
  capability_blocked: 'Your agency is resolving a provider configuration blocker.',
  no_active_mappings: 'Canonical conversion event mappings are still being prepared.',
  live_approval_missing: 'Live-delivery approval is still pending.',
  privacy_approval_missing: 'Privacy and consent approval is still pending.',
  outcome_endpoint_not_ready: 'The external outcome connection still needs validation.',
  activation_gate_unavailable: 'Live activation is not currently available.'
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function latest(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value).getTime())
    .filter(value => Number.isFinite(value))
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
}

function signalSummary(capabilities: PortalCapabilityInput[], modes: Set<string>) {
  const matching = capabilities.filter(capability => modes.has(capability.mode))
  if (!matching.length) {
    return { status: 'not_configured' as const, owners: [], lastEvidenceAt: null }
  }

  const status = matching.reduce<CapabilityStatus>((current, capability) => (
    STATUS_PRIORITY[capability.status] > STATUS_PRIORITY[current] ? capability.status : current
  ), matching[0]!.status)
  const owners = [...new Set(matching.map(capability => capability.managementOrigin))]

  return {
    status,
    owners,
    lastEvidenceAt: latest(matching.map(capability => capability.evidenceAt))
  }
}

function authorityLabel(authority: PortalProfileInput['outcomeAuthority']) {
  if (authority === 'zero_native') return 'Zero CRM'
  if (authority === 'client_webhook') return 'Client webhook'
  if (authority === 'connector_sync') return 'Connected CRM sync'
  return 'Manual import'
}

function platformLabel(platform: PortalDestinationInput['platform']) {
  if (platform === 'meta') return 'Meta'
  if (platform === 'google_data_manager') return 'Google Data Manager'
  if (platform === 'ga4') return 'Google Analytics 4'
  return 'TikTok'
}

function eventIdentity(destinations: PortalDestinationInput[]) {
  const identities = destinations.flatMap(destination => destination.mappings
    .filter(mapping => mapping.isActive && mapping.canonicalEventName)
    .map(mapping => ({
      canonicalEventName: mapping.canonicalEventName as string,
      ...classifyMeasurementEventIdentity(
        mapping.canonicalEventName as string,
        destination.capabilities.map(capability => capability.mode)
      )
    })))
  const unique = new Map(identities.map(identity => [
    `${identity.canonicalEventName}:${identity.mode}`,
    identity
  ]))
  return [...unique.values()].slice(0, 20)
}

export function buildPortalMeasurementHealth(input: {
  profile: PortalProfileInput
  readiness: PortalReadinessInput
  destinations: PortalDestinationInput[]
  aggregate: PortalMeasurementAggregateRow | null
}) {
  const aggregate = input.aggregate ?? {}
  const rejectedCount = numberValue(aggregate.rejected_count)
  const recentRejectedCount = numberValue(aggregate.recent_rejected_count)
  const relevantDestinations = input.profile.enabled
    ? input.destinations.filter(destination => destination.enabled)
    : input.destinations
  const allCapabilities = relevantDestinations.flatMap(destination => destination.capabilities)
  let status: 'onboarding' | 'paused' | 'degraded' | 'healthy' = 'onboarding'
  if (input.profile.environment === 'paused' || input.readiness.status === 'paused') {
    status = 'paused'
  } else if (
    input.readiness.status === 'blocked'
    || input.readiness.status === 'degraded'
    || recentRejectedCount > 0
  ) {
    status = 'degraded'
  } else if (
    input.readiness.status === 'ready'
    && input.readiness.liveEligible
    && input.profile.enabled
    && input.profile.environment === 'live'
  ) {
    status = 'healthy'
  }

  const statusMessage = status === 'healthy'
    ? 'Measurement delivery is healthy and has current provider evidence.'
    : status === 'paused'
      ? 'Measurement delivery is paused while configuration is retained.'
      : status === 'degraded'
        ? 'Measurement needs agency attention; your lead intake and CRM remain available.'
        : 'Measurement is being configured and is not sending live provider events yet.'

  const lastOutcomeSyncAt = iso(aggregate.last_outcome_sync_at)
  const lastEndpointReceivedAt = iso(aggregate.last_endpoint_received_at)
  const authoritySync = input.profile.outcomeAuthority === 'client_webhook'
    ? lastEndpointReceivedAt
    : lastOutcomeSyncAt

  return PortalMeasurementHealthSchema.parse({
    status,
    statusMessage,
    deliveryState: input.profile.enabled ? input.profile.environment : 'dormant',
    authority: {
      source: authorityLabel(input.profile.outcomeAuthority),
      lastSyncAt: authoritySync,
      acceptedOutcomeCount: numberValue(aggregate.outcome_accepted_count),
      rejectedOutcomeCount: numberValue(aggregate.outcome_rejected_count)
    },
    signals: {
      browser: signalSummary(allCapabilities, BROWSER_MODES),
      server: signalSummary(allCapabilities, SERVER_MODES),
      crm: signalSummary(allCapabilities, CRM_MODES)
    },
    eventIdentity: eventIdentity(relevantDestinations),
    destinations: input.destinations.map(destination => ({
      platform: destination.platform,
      label: platformLabel(destination.platform),
      status: destination.healthStatus,
      deliveryState: destination.enabled ? destination.environment : 'dormant',
      lastSuccessAt: iso(destination.lastSuccessAt)
    })),
    delivery: {
      acceptedCount: numberValue(aggregate.accepted_count),
      deliveredCount: numberValue(aggregate.delivered_count),
      rejectedCount,
      pendingCount: numberValue(aggregate.pending_count),
      lastAcceptedAt: iso(aggregate.last_accepted_at),
      lastDeliveredAt: iso(aggregate.last_delivered_at),
      lastRejectedAt: iso(aggregate.last_rejected_at)
    },
    funnel: {
      visits: numberValue(aggregate.visit_count),
      confirmedLeads: numberValue(aggregate.confirmed_lead_count)
    },
    freshness: {
      lastCollectionAt: iso(aggregate.last_collection_at),
      lastDeliveryAt: iso(aggregate.last_delivery_at)
    },
    lastValidatedAt: iso(input.readiness.lastValidatedAt),
    nextSteps: [...new Set([
      ...input.readiness.blockers.map(blocker => (
        NEXT_STEP_BY_BLOCKER[blocker.code] || 'Your agency is reviewing a measurement readiness item.'
      )),
      ...(recentRejectedCount > 0 ? ['Your agency is reviewing recent provider delivery rejections.'] : [])
    ])].slice(0, 10)
  })
}

export type PortalMeasurementHealth = z.infer<typeof PortalMeasurementHealthSchema>
