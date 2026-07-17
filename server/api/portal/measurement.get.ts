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
      `SELECT
         (SELECT COUNT(*) FROM conversion_deliveries
           WHERE client_id = $1 AND status = 'accepted') AS accepted_count,
         (SELECT COUNT(*) FROM conversion_deliveries
           WHERE client_id = $1 AND status = 'delivered') AS delivered_count,
         (SELECT COUNT(*) FROM conversion_deliveries
           WHERE client_id = $1 AND status = 'permanent_failure') AS rejected_count,
         (SELECT COUNT(*) FROM conversion_deliveries
           WHERE client_id = $1 AND status IN ('pending', 'claimed', 'retryable')) AS pending_count,
         (SELECT MAX(last_attempt_at) FROM conversion_deliveries
           WHERE client_id = $1 AND status = 'accepted') AS last_accepted_at,
         (SELECT MAX(delivered_at) FROM conversion_deliveries
           WHERE client_id = $1 AND status = 'delivered') AS last_delivered_at,
         (SELECT MAX(last_attempt_at) FROM conversion_deliveries
           WHERE client_id = $1 AND status = 'permanent_failure') AS last_rejected_at,
         (SELECT COUNT(*) FROM lead_status_events
           WHERE client_id = $1 AND authority_decision = 'accepted') AS outcome_accepted_count,
         (SELECT COUNT(*) FROM lead_status_events
           WHERE client_id = $1 AND authority_decision = 'rejected') AS outcome_rejected_count,
         (SELECT MAX(occurred_at) FROM lead_status_events
           WHERE client_id = $1) AS last_outcome_sync_at,
         (SELECT MAX(last_received_at) FROM outcome_endpoints
           WHERE client_id = $1) AS last_endpoint_received_at`,
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
