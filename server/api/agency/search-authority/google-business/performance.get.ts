import { getQuery } from 'h3'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { isGoogleBusinessPerformanceEnabled } from '~~/server/utils/social-providers/google-business-performance'

const Query = z.object({
  clientId: z.string().uuid()
})

interface AccountSummary {
  account_count: string | number
  healthy_account_count: string | number
}

interface SyncSummary {
  status: 'succeeded' | 'partial' | 'failed'
  reason_code: string | null
  rows_upserted: number
  provider_fetched_at: string | null
  completed_at: string
}

interface MetricRow {
  metric_name: string
  metric_date: string
  metric_value: string | number
  provider_fetched_at: string
}

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }
  const { clientId } = parsed.data
  await requireAgencySearchAuthorityAccess(event, clientId)

  const [accounts, latestSync, metrics] = await Promise.all([
    queryOne<AccountSummary>(
      `SELECT
         COUNT(*) AS account_count,
         COUNT(*) FILTER (WHERE account.last_error IS NULL) AS healthy_account_count
       FROM social_accounts account
       WHERE account.client_id = $1
         AND account.platform = 'google-business'
         AND account.is_active IS TRUE`,
      [clientId]
    ),
    queryOne<SyncSummary>(
      `SELECT run.status, run.reason_code, run.rows_upserted,
              run.provider_fetched_at::text, run.completed_at::text
       FROM search_authority_google_business_sync_runs run
       WHERE run.client_id = $1
       ORDER BY run.completed_at DESC
       LIMIT 1`,
      [clientId]
    ),
    queryRows<MetricRow>(
      `SELECT metric.metric_name, metric.metric_date::text,
              metric.metric_value, metric.provider_fetched_at::text
       FROM search_authority_google_business_metrics metric
       WHERE metric.client_id = $1
         AND metric.metric_date >= CURRENT_DATE - INTERVAL '89 days'
       ORDER BY metric.metric_date ASC, metric.metric_name ASC`,
      [clientId]
    )
  ])

  const enabled = isGoogleBusinessPerformanceEnabled(event)
  const accountCount = Number(accounts?.account_count ?? 0)
  const healthyAccountCount = Number(accounts?.healthy_account_count ?? 0)
  const state = !enabled
    ? 'unavailable'
    : accountCount === 0
      ? 'unavailable'
      : healthyAccountCount === 0 || latestSync?.status === 'failed'
        ? 'blocked'
        : metrics.length > 0
          ? 'ready'
          : 'not_started'
  const reasonCode = !enabled
    ? 'provider_access_not_enabled'
    : accountCount === 0
      ? 'google_business_not_connected'
      : healthyAccountCount === 0
        ? 'google_business_connection_unhealthy'
        : latestSync?.status === 'failed'
          ? latestSync.reason_code || 'provider_sync_failed'
          : metrics.length === 0
            ? 'provider_evidence_not_synced'
            : null

  return {
    enabled,
    state,
    reasonCode,
    accountCount,
    healthyAccountCount,
    latestSync: latestSync ?? null,
    metrics: metrics.map(row => ({
      metricName: row.metric_name,
      metricDate: row.metric_date,
      value: Number(row.metric_value),
      providerFetchedAt: row.provider_fetched_at
    })),
    limitations: [
      'Google Business Profile metrics are provider-reported location evidence, not website sessions or leads.',
      'Missing provider dates remain unavailable and are never backfilled from adjacent dates.'
    ]
  }
})
