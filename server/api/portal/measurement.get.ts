import { queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildPortalMeasurementHealth, type PortalMeasurementAggregateRow } from '~~/server/utils/measurement/portalHealth'
import {
  createMeasurementDestinationRuntime,
  createMeasurementProfileRuntime,
  createMeasurementReadRuntime
} from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const clientId = clientUser.clientId

  const profileService = createMeasurementProfileRuntime(event)
  const readService = createMeasurementReadRuntime()
  const destinationService = createMeasurementDestinationRuntime(event)

  const [profile, readiness, destinationResult, aggregate] = await Promise.all([
    profileService.get(clientId),
    readService.getReadiness(clientId),
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
       ), tracking AS (
         SELECT
           COUNT(*) FILTER (WHERE event_name = 'page_view') AS visit_count,
           MAX(received_at) AS last_collection_at
         FROM tracking_events
         WHERE client_id = $1
       ), canonical AS (
         SELECT COUNT(*) FILTER (WHERE event_name = 'lead_created') AS confirmed_lead_count
         FROM conversion_events
         WHERE client_id = $1
       )
       SELECT delivery.*,
              outcome.*,
              endpoint.*,
              tracking.*,
              canonical.*,
              GREATEST(
                delivery.last_accepted_at,
                delivery.last_delivered_at,
                delivery.last_rejected_at
              ) AS last_delivery_at
         FROM delivery
         CROSS JOIN outcome
         CROSS JOIN endpoint
         CROSS JOIN tracking
         CROSS JOIN canonical`,
      [clientId]
    )
  ])

  return buildPortalMeasurementHealth({
    profile,
    readiness,
    destinations: destinationResult.items,
    aggregate
  })
})
