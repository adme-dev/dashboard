import { queryRows } from '~~/server/utils/db'

interface CallSummaryRow {
  total_calls: string
  answered_calls: string
  missed_calls: string
  unknown_calls: string
  duration_available_calls: string
  total_duration_seconds: string | null
  average_duration_seconds: string | null
  longest_duration_seconds: string | null
  last_synced_at: string | null
}

interface CallCampaignRow {
  campaign_id: string | null
  campaign_name: string | null
  total_calls: string
  answered_calls: string
  missed_calls: string
  duration_available_calls: string
  average_duration_seconds: string | null
}

interface CallHealthRow {
  last_attempt_at: string | null
  last_success_at: string | null
  last_row_count: string | null
  last_error: string | null
  requested_start_date: string | null
  requested_end_date: string | null
  covered_start_date: string | null
  covered_end_date: string | null
  current_job_state: string | null
}

interface WebsiteCallEvidenceRow {
  website_phone_clicks: string
  qualified_calls: string
  last_website_evidence_at: string | null
}

function integer(value: string | number | null | undefined): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function deriveGoogleAdsCallSyncHealth(input: {
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastRowCount: number
  lastError: string | null
  now?: Date
  staleAfterHours?: number
}) {
  const now = input.now ?? new Date()
  const successAgeHours = input.lastSuccessAt
    ? (now.getTime() - new Date(input.lastSuccessAt).getTime()) / 3_600_000
    : null
  if (input.lastError) {
    return { status: 'error' as const, outcome: 'call sync failed', verifiedCallTracking: false }
  }
  if (successAgeHours !== null && successAgeHours > (input.staleAfterHours ?? 48)) {
    return { status: 'stale' as const, outcome: 'call sync is stale', verifiedCallTracking: false }
  }
  if (input.lastSuccessAt && input.lastRowCount === 0) {
    return {
      status: 'success_empty' as const,
      outcome: 'sync successful; no calls returned',
      verifiedCallTracking: false
    }
  }
  if (input.lastSuccessAt) {
    return { status: 'healthy' as const, outcome: 'call records returned', verifiedCallTracking: true }
  }
  if (input.lastAttemptAt) {
    return { status: 'pending' as const, outcome: 'call sync pending', verifiedCallTracking: false }
  }
  return { status: 'dormant' as const, outcome: 'call sync has not run', verifiedCallTracking: false }
}

export async function getGoogleAdsCallAnalytics(input: {
  startDate: string
  endDate: string
  clientId: string | null
}) {
  const params: unknown[] = input.clientId
    ? [input.clientId, input.startDate, input.endDate]
    : [input.startDate, input.endDate]
  const where = input.clientId
    ? `client_id = $1 AND started_at >= $2::date AND started_at < ($3::date + INTERVAL '1 day')`
    : `started_at >= $1::date AND started_at < ($2::date + INTERVAL '1 day')`
  const healthParams = input.clientId ? [input.clientId] : []
  const healthWhere = input.clientId
    ? `WHERE connection.client_id = $1
        OR EXISTS (
          SELECT 1
            FROM ad_account_client_map mapping
            JOIN agency_clients client
              ON client.name = mapping.xero_client_name
              OR (client.xero_contact_id IS NOT NULL AND client.xero_contact_id = mapping.xero_client_code)
           WHERE mapping.connection_id = state.connection_id
             AND client.id = $1
        )`
    : ''

  const [summaryRows, campaignRows, healthRows, websiteEvidenceRows] = await Promise.all([
    queryRows<CallSummaryRow>(
      `SELECT
         COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE status = 'RECEIVED') AS answered_calls,
         COUNT(*) FILTER (WHERE status = 'MISSED') AS missed_calls,
         COUNT(*) FILTER (WHERE status NOT IN ('RECEIVED', 'MISSED')) AS unknown_calls,
         COUNT(duration_seconds) AS duration_available_calls,
         SUM(duration_seconds) AS total_duration_seconds,
         AVG(duration_seconds) AS average_duration_seconds,
         MAX(duration_seconds) AS longest_duration_seconds,
         MAX(last_synced_at) AS last_synced_at
       FROM google_ads_calls
       WHERE ${where}`,
      params
    ),
    queryRows<CallCampaignRow>(
      `SELECT
         campaign_id,
         COALESCE(campaign_name, 'Unattributed campaign') AS campaign_name,
         COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE status = 'RECEIVED') AS answered_calls,
         COUNT(*) FILTER (WHERE status = 'MISSED') AS missed_calls,
         COUNT(duration_seconds) AS duration_available_calls,
         AVG(duration_seconds) AS average_duration_seconds
       FROM google_ads_calls
       WHERE ${where}
       GROUP BY campaign_id, campaign_name
       ORDER BY total_calls DESC, campaign_name ASC
       LIMIT 100`,
      params
    ),
    queryRows<CallHealthRow>(
      `SELECT MAX(state.last_attempt_at) AS last_attempt_at,
              MAX(state.last_success_at) AS last_success_at,
              COALESCE(SUM(state.last_row_count), 0) AS last_row_count,
              MAX(state.last_error) FILTER (WHERE state.last_error IS NOT NULL) AS last_error,
              MIN(state.last_requested_start_date) AS requested_start_date,
              MAX(state.last_requested_end_date) AS requested_end_date,
              MIN(state.covered_start_date) AS covered_start_date,
              MAX(state.covered_end_date) AS covered_end_date,
              CASE
                WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'failed') > 0 THEN 'failed'
                WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'running') > 0 THEN 'running'
                WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'pending') > 0 THEN 'pending'
                WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'completed') > 0 THEN 'completed'
                ELSE 'idle'
              END AS current_job_state
         FROM google_ads_call_sync_state state
         JOIN social_connections connection ON connection.id = state.connection_id
         ${healthWhere}`,
      healthParams
    ),
    input.clientId
      ? queryRows<WebsiteCallEvidenceRow>(
          `SELECT COUNT(*) FILTER (
                    WHERE canonical_event_name = 'phone_click'
                  ) AS website_phone_clicks,
                  COUNT(*) FILTER (
                    WHERE call_qualified = TRUE
                  ) AS qualified_calls,
                  MAX(received_at) AS last_website_evidence_at
             FROM measurement_evidence_events
            WHERE client_id = $1
              AND occurred_at >= $2::date
              AND occurred_at < ($3::date + INTERVAL '1 day')`,
          params
        )
      : Promise.resolve([])
  ])

  const row = summaryRows?.[0] || {} as CallSummaryRow
  const health = healthRows?.[0] || {} as CallHealthRow
  const websiteEvidence = websiteEvidenceRows?.[0] || {} as WebsiteCallEvidenceRow
  const healthResult = deriveGoogleAdsCallSyncHealth({
    lastAttemptAt: health.last_attempt_at || null,
    lastSuccessAt: health.last_success_at || null,
    lastRowCount: integer(health.last_row_count),
    lastError: health.last_error || null
  })

  return {
    window: { startDate: input.startDate, endDate: input.endDate },
    clientId: input.clientId,
    summary: {
      totalCalls: integer(row.total_calls),
      answeredCalls: integer(row.answered_calls),
      missedCalls: integer(row.missed_calls),
      unknownCalls: integer(row.unknown_calls),
      durationAvailableCalls: integer(row.duration_available_calls),
      totalDurationSeconds: nullableNumber(row.total_duration_seconds),
      averageDurationSeconds: nullableNumber(row.average_duration_seconds),
      longestDurationSeconds: nullableNumber(row.longest_duration_seconds),
      lastSyncedAt: row.last_synced_at || null
    },
    health: {
      lastAttemptAt: health.last_attempt_at || null,
      lastSuccessAt: health.last_success_at || null,
      lastRowCount: integer(health.last_row_count),
      status: healthResult.status,
      outcome: healthResult.outcome,
      verifiedCallTracking: healthResult.verifiedCallTracking,
      lastError: health.last_error || null,
      requestedRange: health.requested_start_date && health.requested_end_date
        ? { startDate: health.requested_start_date, endDate: health.requested_end_date }
        : null,
      coveredRange: health.covered_start_date && health.covered_end_date
        ? { startDate: health.covered_start_date, endDate: health.covered_end_date }
        : null,
      currentJobState: health.current_job_state || 'idle'
    },
    layers: {
      websitePhoneClicks: integer(websiteEvidence.website_phone_clicks),
      googleHostedCallInteractions: integer(row.total_calls),
      connectedCalls: integer(row.answered_calls),
      qualifiedCalls: integer(websiteEvidence.qualified_calls),
      lastWebsiteEvidenceAt: websiteEvidence.last_website_evidence_at || null,
      lastProviderCallSyncAt: health.last_success_at || null
    },
    byCampaign: (campaignRows || []).map(campaign => ({
      campaignId: campaign.campaign_id,
      campaignName: campaign.campaign_name || 'Unattributed campaign',
      totalCalls: integer(campaign.total_calls),
      answeredCalls: integer(campaign.answered_calls),
      missedCalls: integer(campaign.missed_calls),
      durationAvailableCalls: integer(campaign.duration_available_calls),
      averageDurationSeconds: nullableNumber(campaign.average_duration_seconds)
    })),
    basis: 'google_ads_call_view',
    durationNote: 'Duration is null when Google Ads did not return duration for any matching call; it is never inferred from click-to-call events.'
  }
}
