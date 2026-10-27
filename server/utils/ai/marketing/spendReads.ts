import { ownerClientNameSql } from './clientReads'
import { createError } from 'h3'
import { queryRowsFresh as queryRows } from '~~/server/utils/db'
import { STALENESS_THRESHOLD_HOURS } from '../tools/responseContract'
import { buildSpendSummaryItems, buildSpendSummaryTotals, type SpendSummaryRow, type SpendSummaryItem } from '~~/server/utils/socialSpendSummary'
import { sanitizeSpendSyncFailureReason, sanitizeSpendSyncFailures } from '~~/server/utils/spendSyncFailureSanitizer'
import { clientScopeSql, requireMarketingReadPermission, requireScopedClient, resolveStoredReportingTenant, type MarketingReadScope } from './readScope'
export type SpendReadQuery = { month: number; year: number; platform?: string; clientId?: string; clientName?: string }
export type MarketingSpendItem = Omit<SpendSummaryItem, 'commission' | 'commissionRate' | 'clientCode' | 'owner'>
type CommonSummary = { month: number; year: number; platform: string; lastSyncedAt: string | null; coverageDeltaStatus: string }
export type SpendSummaryResponse =
 | (CommonSummary & { projection: 'marketing'; items: MarketingSpendItem[]; totals: { budget: number; spend: number; variance: number } })
 | (CommonSummary & { projection: 'finance'; items: SpendSummaryItem[]; totals: ReturnType<typeof buildSpendSummaryTotals>; latestSyncJobs?: Array<{ platform: string; status: string; syncedCount: number; totalSpend: number; failures: Array<{ account: string; reason: string }>; error: string | null; startedAt: string; finishedAt: string | null; totalAccounts: number | null; processedAccounts: number }> })
export async function readSpendSummary(scope: MarketingReadScope, query: SpendReadQuery): Promise<SpendSummaryResponse> {
  requireMarketingReadPermission(scope, 'pacing')
  const { month, year } = query
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) throw createError({ statusCode: 400, statusMessage: 'Invalid reporting period' })
  if (query.clientId) await requireScopedClient(scope, query.clientId)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const platform = query.platform === 'google' ? 'google_ads' : query.platform
  const tenantId = scope.financialReadAllowed ? await resolveStoredReportingTenant(scope, 'pacing') : null
  let sql = `
    SELECT
      ms.platform,
      ms.client_id::text as client_id,
      ac.name as client_name,
      sc.account_id as account_id,
      sc.account_name as account_name,
      MIN(ms.campaign_name) as sample_campaign_name,
      ${scope.financialReadAllowed ? 'ac.xero_contact_id as client_ref, MAX(cf.account_manager_id::text) as owner_id, MAX(tm.name) as owner_name,' : ''}
      SUM(COALESCE(ms.budget_allocated, 0)) as total_budget,
      SUM(COALESCE(ms.actual_spend, 0)) as total_spend,
      ${scope.financialReadAllowed ? 'SUM(COALESCE(ms.commission_amount, 0)) as total_commission,' : ''}
      SUM(COALESCE(ms.impressions, 0)) as total_impressions,
      SUM(COALESCE(ms.clicks, 0)) as total_clicks,
      SUM(COALESCE(ms.conversions, 0)) as total_conversions,
      COUNT(*)::int as campaign_count,
      COUNT(*) FILTER (WHERE COALESCE(ms.budget_allocated, 0) > 0)::int as budgeted_campaign_count,
      MAX(ms.synced_at) as last_synced_at,
      MIN(ms.synced_at) as oldest_synced_at,
      MAX(COALESCE(coverage.spend_as_of, ms.synced_at::date))::text as spend_as_of,
      COUNT(*) FILTER (WHERE ms.synced_at IS NULL OR ms.synced_at < NOW() - MAKE_INTERVAL(hours => $2))::int as stale_row_count,
      array_agg(ms.id ORDER BY ms.actual_spend DESC) as spend_ids,
      bool_or(COALESCE(ms.budget_rolling, false)) as is_rolling
      ${scope.financialReadAllowed ? ', MAX(ms.commission_rate) as commission_rate' : ''}
    FROM media_spend ms
    LEFT JOIN agency_clients ac ON ms.client_id = ac.id
    LEFT JOIN social_connections sc ON sc.id = ms.connection_id
    LEFT JOIN LATERAL (
      SELECT MAX(ds.spend_date) AS spend_as_of
      FROM daily_spend ds
      WHERE ds.media_spend_id = ms.id
    ) coverage ON TRUE
    ${scope.financialReadAllowed ? 'LEFT JOIN customer_finance cf ON cf.contact_id = ac.xero_contact_id AND cf.tenant_id = $3 LEFT JOIN team_members tm ON tm.id = cf.account_manager_id' : ''}
    WHERE ms.period = $1
  `
  const params: unknown[] = [period, STALENESS_THRESHOLD_HOURS]
  if (scope.financialReadAllowed) params.push(tenantId)
  sql += ` AND ${clientScopeSql(scope, 'ms.client_id', params)}`
  if (query.clientId) { params.push(query.clientId); sql += ` AND ms.client_id = $${params.length}` }

  const ownerName = ownerClientNameSql(scope, query.clientName, 'ms.client_id', params)
  if (ownerName) sql += ` AND ${ownerName}`
  if (platform && platform !== 'all') {
    sql += ` AND ms.platform = $${params.length + 1}`
    params.push(platform)
  }

  sql += ` GROUP BY ms.platform, ms.client_id, ac.name, ${scope.financialReadAllowed ? 'ac.xero_contact_id,' : ''} sc.account_id, sc.account_name ORDER BY total_spend DESC`

  const rows = await queryRows<SpendSummaryRow>(sql, params)
  const jobPlatform = platform === 'google_ads' ? 'google' : platform
  const latestSyncJobs = scope.ownerVerified && scope.clientIds === null ? await queryRows<{
    platform: string
    status: string
    synced_count: number
    total_spend: string
    failures: Array<{ account: string; reason: string }>
    error: string | null
    started_at: string
    finished_at: string | null
    total_accounts: number | null
    processed_accounts: number
  }>(
    `SELECT DISTINCT ON (platform)
        platform, status, synced_count, total_spend, failures, error,
        started_at, finished_at, total_accounts, processed_accounts
     FROM spend_sync_jobs
     WHERE period = $1
     ${jobPlatform && jobPlatform !== 'all' ? 'AND platform = $2' : ''}
     ORDER BY platform, started_at DESC`,
    jobPlatform && jobPlatform !== 'all' ? [period, jobPlatform] : [period]
  ) : []

  const summary = buildSpendSummaryItems(rows)
  const totals = buildSpendSummaryTotals(summary)
  const lastSyncedAt = summary.reduce((latest: string | null, item) => item.lastSyncedAt && (!latest || item.lastSyncedAt > latest) ? item.lastSyncedAt : latest, null)
  const common = { month, year, platform: platform || 'all', lastSyncedAt, coverageDeltaStatus: scope.ownerVerified && scope.clientIds === null ? 'owner_global_available' : 'unavailable_for_client_scope' }
  if (!scope.financialReadAllowed) return { ...common, projection: 'marketing',
    items: summary.map(({ commission, commissionRate, clientCode, owner, ...marketing }) => marketing),
    totals: { budget: totals.budget, spend: totals.spend, variance: totals.variance } }
  return { ...common, projection: 'finance', items: summary, totals,
    ...(scope.ownerVerified && scope.clientIds === null ? { latestSyncJobs: latestSyncJobs.map(job => ({
      platform: job.platform, status: job.status, syncedCount: Number(job.synced_count) || 0,
      totalSpend: Number(job.total_spend) || 0, failures: sanitizeSpendSyncFailures(job.failures),
      error: job.error ? sanitizeSpendSyncFailureReason(job.error) : null,
      startedAt: job.started_at, finishedAt: job.finished_at, totalAccounts: job.total_accounts, processedAccounts: job.processed_accounts,
    })) } : {}) }
}
