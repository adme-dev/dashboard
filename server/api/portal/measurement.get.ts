import { queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import { buildPortalMeasurementHealth, type PortalMeasurementAggregateRow } from '~~/server/utils/measurement/portalHealth'
import {
  createMeasurementDestinationRuntime,
  createMeasurementProfileRuntime,
  createMeasurementReadRuntime
} from '~~/server/utils/measurement/runtime'

const FALLBACK_PROFILE_ID = '00000000-0000-0000-0000-000000000000'

function isMeasurementNotFound(error: unknown): error is MeasurementError {
  return (
    error instanceof Error
    && (error as { code?: string }).code === 'MEASUREMENT_NOT_FOUND'
  )
}

function onboardingProfileFallback() {
  return {
    enabled: false,
    environment: 'test' as const,
    collectionTier: 'cloudflare_owned' as const,
    consentMode: 'off' as const,
    outcomeAuthority: 'zero_native' as const
  }
}

function onboardingReadinessFallback(
  clientId: string,
  profile: {
    id?: string | null
    enabled?: boolean
    environment?: 'test' | 'live' | 'paused'
    cacheStatus?: 'not_published' | 'fresh' | 'stale' | 'error'
    outcomeAuthority?: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
  }
) {
  return {
    clientId,
    profileId: profile.id ?? FALLBACK_PROFILE_ID,
    configVersion: 1,
    status: 'onboarding' as const,
    liveEligible: false,
    approvals: { privacy: false, live: false },
    profile: {
      enabled: profile.enabled ?? false,
      environment: profile.environment ?? 'test',
      cacheStatus: profile.cacheStatus ?? 'not_published',
      outcomeAuthority: profile.outcomeAuthority ?? 'zero_native'
    },
    counts: {
      destinations: 0,
      readyDestinations: 0,
      degradedDestinations: 0,
      blockedDestinations: 0,
      capabilities: 0,
      readyCapabilities: 0,
      degradedCapabilities: 0,
      blockedCapabilities: 0,
      activeMappings: 0,
      outcomeEndpoints: 0,
      readyOutcomeEndpoints: 0
    },
    blockers: [{
      code: 'no_destinations' as const,
      message: 'Measurement profile has not finished onboarding.'
    }],
    lastValidatedAt: null,
    lastSuccessAt: null
  }
}

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const clientId = clientUser.clientId

  const profileService = createMeasurementProfileRuntime(event)
  const readService = createMeasurementReadRuntime()
  const destinationService = createMeasurementDestinationRuntime(event)

  const [profileResult, readinessResult, destinationResult, aggregate] = await Promise.all([
    profileService.get(clientId).catch((error: unknown) => {
      if (isMeasurementNotFound(error)) return null
      throw error
    }),
    readService.getReadiness(clientId).catch((error: unknown) => {
      if (isMeasurementNotFound(error)) return null
      throw error
    }),
    destinationService.list({ clientId, page: 1, pageSize: 100 }),
    queryOne<PortalMeasurementAggregateRow>(
      `WITH delivery AS (
         SELECT
           COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_count,
           COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
           COUNT(*) FILTER (WHERE status = 'permanent_failure') AS rejected_count,
           COUNT(*) FILTER (
             WHERE status = 'permanent_failure'
               AND updated_at >= NOW() - INTERVAL '24 hours'
           ) AS recent_rejected_count,
           COUNT(*) FILTER (WHERE status IN ('pending', 'claimed', 'retryable')) AS pending_count,
           MAX(last_attempt_at) FILTER (WHERE status = 'accepted') AS last_accepted_at,
           MAX(delivered_at) FILTER (WHERE status = 'delivered') AS last_delivered_at,
           MAX(last_attempt_at) FILTER (WHERE status = 'permanent_failure') AS last_rejected_at
         FROM conversion_deliveries
         WHERE client_id = $1
       ), outcome AS (
         SELECT
           COUNT(*) FILTER (WHERE authority_decision = 'accepted') AS outcome_accepted_count,
           COUNT(*) FILTER (WHERE authority_decision = 'rejected') AS outcome_rejected_count,
           MAX(occurred_at) AS last_outcome_sync_at
         FROM lead_status_events
         WHERE client_id = $1
           AND authority_mode = (
             SELECT outcome_authority
             FROM client_measurement_profiles
             WHERE client_id = $1
           )
       ), endpoint AS (
         SELECT MAX(last_received_at) AS last_endpoint_received_at
         FROM outcome_endpoints
         WHERE client_id = $1
           AND status IN ('test', 'live', 'paused')
       )
       SELECT * FROM delivery CROSS JOIN outcome CROSS JOIN endpoint`,
      [clientId]
    )
  ])

  const profile = profileResult ?? onboardingProfileFallback()
  const readiness = readinessResult ?? onboardingReadinessFallback(clientId, profileResult ? {
    id: profileResult.id,
    enabled: profileResult.enabled,
    environment: profileResult.environment,
    cacheStatus: profileResult.cacheStatus,
    outcomeAuthority: profileResult.outcomeAuthority
  } : {})

  return buildPortalMeasurementHealth({
    profile,
    readiness,
    destinations: destinationResult.items,
    aggregate
  })
})
