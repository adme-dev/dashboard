import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { STALENESS_THRESHOLD_HOURS } from '~~/server/utils/ai/tools/responseContract'
import { cachedFetch } from '~~/server/utils/kv'
import { getSelectedTenant } from '~~/server/utils/session'
import { buildSpendSummaryItems, buildSpendSummaryTotals, type SpendSummaryRow } from '~~/server/utils/socialSpendSummary'
import { sanitizeSpendSyncFailureReason, sanitizeSpendSyncFailures } from '~~/server/utils/spendSyncFailureSanitizer'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const rawPlatform = query.platform ? String(query.platform) : null
  const platform = rawPlatform === 'google' ? 'google_ads' : rawPlatform
  const tenantId = await getSelectedTenant(event)

  const emptyResult = { month, year, platform: platform || 'all', items: [], totals: { budget: 0, spend: 0, commission: 0, variance: 0 }, lastSyncedAt: null, latestSyncJobs: [] }

  const cacheKey = `spend:summary:${tenantId || 'no-tenant'}:${period}:${platform || 'all'}`

  return cachedFetch(event, cacheKey, 300, async () => {
  try {
    let sql = `
      SELECT
        ms.platform,
        ms.client_id::text as client_id,
        ac.name as client_name,
        sc.account_id as account_id,
        sc.account_name as account_name,
        MIN(ms.campaign_name) as sample_campaign_name,
        ac.xero_contact_id as client_ref,
        MAX(cf.account_manager_id::text) as owner_id,
        MAX(tm.name) as owner_name,
        SUM(COALESCE(ms.budget_allocated, 0)) as total_budget,
        SUM(COALESCE(ms.actual_spend, 0)) as total_spend,
        SUM(COALESCE(ms.commission_amount, 0)) as total_commission,
        SUM(COALESCE(ms.impressions, 0)) as total_impressions,
        SUM(COALESCE(ms.clicks, 0)) as total_clicks,
        SUM(COALESCE(ms.conversions, 0)) as total_conversions,
        COUNT(*)::int as campaign_count,
        COUNT(*) FILTER (WHERE COALESCE(ms.budget_allocated, 0) > 0)::int as budgeted_campaign_count,
        MAX(ms.synced_at) as last_synced_at,
        MIN(ms.synced_at) as oldest_synced_at,
        MAX(COALESCE(coverage.spend_as_of, ms.synced_at::date))::text as spend_as_of,
        COUNT(*) FILTER (WHERE ms.synced_at IS NULL OR ms.synced_at < NOW() - MAKE_INTERVAL(hours => $3))::int as stale_row_count,
        array_agg(ms.id ORDER BY ms.actual_spend DESC) as spend_ids,
        bool_or(COALESCE(ms.budget_rolling, false)) as is_rolling,
        MAX(ms.commission_rate) as commission_rate
      FROM media_spend ms
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      LEFT JOIN LATERAL (
        SELECT MAX(ds.spend_date) AS spend_as_of
        FROM daily_spend ds
        WHERE ds.media_spend_id = ms.id
      ) coverage ON TRUE
      LEFT JOIN customer_finance cf ON cf.contact_id = ac.xero_contact_id AND cf.tenant_id = $2
      LEFT JOIN team_members tm ON tm.id = cf.account_manager_id
      WHERE ms.period = $1
    `
    const params: any[] = [period, tenantId, STALENESS_THRESHOLD_HOURS]

    if (platform && platform !== 'all') {
      sql += ` AND ms.platform = $${params.length + 1}`
      params.push(platform)
    }

    sql += ` GROUP BY ms.platform, ms.client_id, ac.name, ac.xero_contact_id, sc.account_id, sc.account_name ORDER BY total_spend DESC`

    const rows = await queryRows<SpendSummaryRow>(sql, params)
    const jobPlatform = platform === 'google_ads' ? 'google' : platform
    const latestSyncJobs = await queryRows<{
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
    )

    const summary = buildSpendSummaryItems(rows)
    const totals = buildSpendSummaryTotals(summary)
    const lastSyncedAt = summary.reduce((latest: string | null, item) => {
      if (!item.lastSyncedAt) return latest
      if (!latest) return item.lastSyncedAt
      return item.lastSyncedAt > latest ? item.lastSyncedAt : latest
    }, null as string | null)

    return {
      month,
      year,
      platform: platform || 'all',
      items: summary,
      totals,
      lastSyncedAt,
      latestSyncJobs: latestSyncJobs.map(job => ({
        platform: job.platform,
        status: job.status,
        syncedCount: Number(job.synced_count) || 0,
        totalSpend: Number(job.total_spend) || 0,
        failures: sanitizeSpendSyncFailures(job.failures),
        error: job.error ? sanitizeSpendSyncFailureReason(job.error) : null,
        startedAt: job.started_at,
        finishedAt: job.finished_at,
        totalAccounts: job.total_accounts,
        processedAccounts: job.processed_accounts,
      })),
    }
  } catch (err: any) {
    // Table may not exist if migrations haven't been run
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return emptyResult
    }
    throw err
  }
  }) // end cachedFetch
})
