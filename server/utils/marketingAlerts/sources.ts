// Read-only loaders for the marketing alert detectors. Every query is a SELECT over data other
// jobs already store (media_spend, anomalies, ad_performance_snapshots, spend_sync_jobs,
// campaign_search_term_*); nothing here calls a provider API.
//
// media_spend has no tenant column (single-org install), so the marketing sources are not
// tenant-filtered — the same convention as /api/agency/budget-alerts/health and spend-auto-action.
import { queryRows } from '~~/server/utils/db'
import type { MarketingAlertsThresholds } from './config'
import type { AnomalyRow, PacingRow, PolicyAdRow, PolicyCampaignRow, SearchTermRow, SyncJobRow } from './detectors'

export async function loadPacingRows(period: string): Promise<PacingRow[]> {
  return queryRows<PacingRow>(
    `SELECT ms.id::text AS media_spend_id,
            ac.id::text AS client_id,
            ac.name AS client_name,
            ms.platform,
            sc.account_id,
            sc.account_name,
            ms.campaign_id,
            ms.campaign_name,
            ms.campaign_status,
            ms.end_date::text AS end_date,
            COALESCE(ms.budget_rolling, false) AS budget_rolling,
            COALESCE(ms.budget_allocated, 0) AS monthly_budget,
            COALESCE(ms.actual_spend, 0) AS mtd_spend,
            coverage.spend_as_of::text AS spend_as_of,
            ms.synced_at::text AS synced_at
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
       LEFT JOIN social_connections sc ON sc.id = ms.connection_id
       LEFT JOIN LATERAL (
         SELECT MAX(ds.spend_date) AS spend_as_of FROM daily_spend ds WHERE ds.media_spend_id = ms.id
       ) coverage ON TRUE
      WHERE ms.period = $1
        AND ms.platform IN ('google_ads', 'meta')`,
    [period]
  )
}

export async function loadOpenMarketingAnomalies(): Promise<AnomalyRow[]> {
  return queryRows<AnomalyRow>(
    `SELECT a.id::text AS id,
            a.type,
            a.severity,
            a.title,
            a.description,
            a.fingerprint,
            ac.id::text AS client_id,
            COALESCE(ac.name, a.context->>'client') AS client_name,
            COALESCE(ms.platform, a.context->>'vendor') AS platform
       FROM anomalies a
       LEFT JOIN media_spend ms ON ms.id::text = a.context->>'mediaSpendId'
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
      WHERE a.type IN ('adspend', 'ga4')
        AND a.status NOT IN ('resolved', 'dismissed')
        AND a.severity IN ('critical', 'warning')
        AND (a.snoozed_until IS NULL OR a.snoozed_until < NOW())
      ORDER BY a.last_detected_at DESC
      LIMIT 500`
  )
}

export async function loadGooglePolicyRows(period: string): Promise<{ campaigns: PolicyCampaignRow[], ads: PolicyAdRow[] }> {
  const campaigns = await queryRows<PolicyCampaignRow>(
    `SELECT ms.id::text AS media_spend_id,
            ac.id::text AS client_id,
            ac.name AS client_name,
            sc.account_id,
            ms.campaign_id,
            ms.campaign_name,
            ms.campaign_status,
            ms.serving_status,
            ARRAY(
              SELECT DISTINCT reason
                FROM unnest(COALESCE(ms.provider_serving_status_reasons, '{}'::text[]) || COALESCE(ms.serving_status_reasons, '{}'::text[])) AS reason
               WHERE reason IS NOT NULL AND reason <> ''
            ) AS reasons
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
       LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ms.period = $1
        AND ms.platform = 'google_ads'
        AND (COALESCE(array_length(ms.provider_serving_status_reasons, 1), 0) > 0
          OR COALESCE(array_length(ms.serving_status_reasons, 1), 0) > 0)`,
    [period]
  )
  const ads = await queryRows<PolicyAdRow>(
    `SELECT DISTINCT ON (aps.media_spend_id, aps.ad_id)
            aps.media_spend_id::text AS media_spend_id,
            ac.id::text AS client_id,
            ac.name AS client_name,
            sc.account_id,
            ms.campaign_id,
            ms.campaign_name,
            aps.ad_id,
            aps.ad_name,
            aps.approval_status,
            aps.policy_issues
       FROM ad_performance_snapshots aps
       JOIN media_spend ms ON ms.id = aps.media_spend_id
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
       LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ms.period = $1
        AND ms.platform = 'google_ads'
        AND aps.approval_status IS NOT NULL
      ORDER BY aps.media_spend_id, aps.ad_id, aps.approval_synced_at DESC NULLS LAST, aps.synced_at DESC NULLS LAST`,
    [period]
  )
  return { campaigns, ads }
}

/** The newest job per platform plus that platform's newest successful completion. */
export async function loadLatestSpendSyncJobs(): Promise<SyncJobRow[]> {
  return queryRows<SyncJobRow>(
    `SELECT latest.platform,
            latest.status,
            latest.failures,
            latest.error,
            latest.coverage_failed,
            latest.started_at::text AS started_at,
            success.last_success_at::text AS last_success_at
       FROM (VALUES ('google'::text), ('meta'::text)) expected(platform)
       JOIN LATERAL (
         SELECT j.platform, j.status, j.failures, j.error, j.coverage_failed, j.started_at
           FROM spend_sync_jobs j
          WHERE j.platform = expected.platform
            AND j.status <> 'running'
          ORDER BY j.started_at DESC
          LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT MAX(COALESCE(j.finished_at, j.started_at)) AS last_success_at
           FROM spend_sync_jobs j
          WHERE j.platform = expected.platform
            AND j.status = 'completed'
            AND COALESCE(j.coverage_failed, false) = false
       ) success ON TRUE`
  )
}

/** Terms from each campaign's newest full/limited snapshot that is recent enough to trust. */
export async function loadSearchTermRows(period: string, thresholds: MarketingAlertsThresholds): Promise<SearchTermRow[]> {
  return queryRows<SearchTermRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (s.media_spend_id) s.id, s.media_spend_id, s.range_start, s.range_end
         FROM campaign_search_term_syncs s
         JOIN media_spend ms ON ms.id = s.media_spend_id
        WHERE ms.period = $1
          AND ms.platform = 'google_ads'
          AND s.coverage IN ('full', 'limited')
          AND s.synced_at > NOW() - MAKE_INTERVAL(days => $2)
        ORDER BY s.media_spend_id, s.synced_at DESC
     )
     SELECT latest.media_spend_id::text AS media_spend_id,
            ac.id::text AS client_id,
            ac.name AS client_name,
            sc.account_id,
            ms.campaign_id,
            ms.campaign_name,
            COALESCE(ms.conversions, 0) AS campaign_conversions,
            t.search_term,
            t.targeting_status,
            t.clicks,
            t.cost,
            latest.range_start::text AS range_start,
            latest.range_end::text AS range_end
       FROM latest
       JOIN campaign_search_term_snapshots t ON t.sync_id = latest.id
       JOIN media_spend ms ON ms.id = latest.media_spend_id
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
       LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE t.cost >= $3`,
    [period, Math.max(1, Math.round(thresholds.searchTermMaxSnapshotAgeDays)), thresholds.searchTermMinTermCost]
  )
}
