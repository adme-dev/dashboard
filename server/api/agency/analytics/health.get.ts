/**
 * Agency Analytics Health Probe
 * GET /api/agency/analytics/health
 *
 * A single endpoint for deterministically diagnosing why a query set is empty.
 *
 * Query params: startDate, endDate, clientId?, platform?
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { classifyConnectionHealth } from '~~/server/utils/connectionHealth'
import { buildClientCondition, dailySpendWindow } from '~~/server/utils/analyticsMetrics'

interface HealthIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

interface CampaignHealth {
  filters: {
    startDate: string
    endDate: string
    platforms: string[]
    clientId: string | null
  }
  campaign: {
    activeCampaignCount: number
    rawCampaignCount: number
    campaignsByPlatform: { platform: string; campaignCount: number }[]
  }
  connections: {
    active: number
    total: number
    activePlatforms: string[]
    inactive: number
    inactivePlatforms: string[]
    hasActiveForFilters: boolean
    hasActiveButStale: boolean
  }
  sync: {
    lastSyncedAt: string | null
    hasRecentSync: boolean
    syncAgeMinutes: number | null
    rawRowsInWindow: number
  }
  mapping: {
    directClientCampaignRows: boolean
    socialClientLinks: boolean
    campaignAccountMappings: boolean
  }
  ga4: {
    hasPropertyMap: boolean
    rowsInWindow: number
  }
  issues: HealthIssue[]
}

const CAMPAIGN_STATUS_FILTER = `(ms.campaign_status IS NULL OR ms.campaign_status NOT IN ('DELETED', 'ARCHIVED', 'REMOVED', 'deleted', 'archived', 'removed'))`
const STALE_MINUTES = 60 * 24

function normalizePlatforms(value: string | string[] | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const clientId = (q.clientId as string | undefined) || null
  const platforms = normalizePlatforms(q.platform as string | undefined)
  const hasPlatformFilter = platforms.length > 0

  const issues: HealthIssue[] = []

  const campaignBaseWhere: string[] = [dailySpendWindow(1, 2)]
  const campaignParams: unknown[] = [startDate, endDate]
  let campaignIdx = 3

  if (clientId) {
    campaignBaseWhere.push(buildClientCondition(campaignIdx))
    campaignParams.push(clientId)
    campaignIdx++
  }
  if (hasPlatformFilter) {
    campaignBaseWhere.push(`ms.platform = ANY($${campaignIdx})`)
    campaignParams.push(platforms)
    campaignIdx++
  }
  const campaignBaseWhereSql = campaignBaseWhere.join(' AND ')

  const campaignCounts = await queryOne<{
    active_campaign_count: string
    raw_campaign_count: string
  }>(`
    SELECT
      COUNT(DISTINCT ms.id) FILTER (WHERE ${CAMPAIGN_STATUS_FILTER}) AS active_campaign_count,
      COUNT(DISTINCT ms.id) AS raw_campaign_count
    FROM media_spend ms
    JOIN daily_spend ds ON ds.media_spend_id = ms.id
    WHERE ${campaignBaseWhereSql}
  `, campaignParams)

  const campaignByPlatform = await queryRows<{ platform: string; campaign_count: string }>(`
    SELECT
      ms.platform,
      COUNT(DISTINCT ms.id) AS campaign_count
    FROM media_spend ms
    JOIN daily_spend ds ON ds.media_spend_id = ms.id
    WHERE ${campaignBaseWhereSql} AND ${CAMPAIGN_STATUS_FILTER}
    GROUP BY ms.platform
    ORDER BY ms.platform
  `, campaignParams)

  const connectionWhere: string[] = []
  const connectionParams: unknown[] = []
  if (hasPlatformFilter) {
    connectionWhere.push(`platform = ANY($1)`)
    connectionParams.push(platforms)
  }
  const connectionRows = await queryRows<{
    platform: string
    status: string
    token_expires_at: string | null
    refresh_token: string | null
    profile_has_refresh_token: boolean
    last_synced_at: string | null
  }>(`
    SELECT sc.platform, sc.status,
           COALESCE(gcp.token_expires_at, sc.token_expires_at) AS token_expires_at,
           sc.refresh_token,
           (gcp.refresh_token_encrypted IS NOT NULL) AS profile_has_refresh_token,
           (SELECT MAX(ms.synced_at) FROM media_spend ms WHERE ms.connection_id = sc.id) AS last_synced_at
    FROM social_connections sc
    LEFT JOIN google_credential_profiles gcp ON gcp.id = sc.google_credential_profile_id
    ${connectionWhere.length ? `WHERE ${connectionWhere.join(' AND ')}` : ''}
  `, connectionParams)

  let activeConnectionCount = 0
  let inactiveConnectionCount = 0
  const activePlatforms = new Set<string>()
  const inactivePlatforms = new Set<string>()
  let activeButStale = false
  for (const row of connectionRows) {
    const health = classifyConnectionHealth({
      status: row.status,
      tokenExpiresAt: row.token_expires_at,
      refreshToken: row.profile_has_refresh_token ? 'profile-refresh-available' : row.refresh_token,
      lastSyncedAt: row.last_synced_at,
    })
    if (health.health === 'error') {
      inactiveConnectionCount++
      inactivePlatforms.add(row.platform)
    } else {
      activeConnectionCount++
      activePlatforms.add(row.platform)
      if (health.health === 'stale_sync') {
        activeButStale = true
      }
    }
  }

  const rawCampaignRows = Number(campaignCounts?.raw_campaign_count || 0)
  const activeCampaignCount = Number(campaignCounts?.active_campaign_count || 0)
  const campaignCountsByPlatform = campaignByPlatform.map((r) => ({
    platform: r.platform,
    campaignCount: Number(r.campaign_count || 0)
  }))

  const syncRows = await queryOne<{ max_synced_at: string | null }>(`
    SELECT MAX(ms.synced_at) AS max_synced_at
    FROM media_spend ms
    JOIN daily_spend ds ON ds.media_spend_id = ms.id
    WHERE ${campaignBaseWhereSql}
  `, campaignParams)

  const lastSyncedAt = syncRows?.max_synced_at ?? null
  const syncAge = lastSyncedAt ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000) : null
  const hasRecentSync = syncAge !== null && syncAge <= STALE_MINUTES

  const mappingChecks = clientId
    ? await Promise.all([
      queryOne<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM media_spend ms
        JOIN daily_spend ds ON ds.media_spend_id = ms.id
        WHERE ms.client_id = $3 AND ${dailySpendWindow(1, 2)}
      ) AS exists
      `, [startDate, endDate, clientId]),
      queryOne<{ exists: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM social_connections WHERE client_id = $1) AS exists
      `, [clientId]),
      queryOne<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM ad_account_client_map acm
          JOIN agency_clients ac ON ac.id = $1 AND acm.xero_client_name = ac.name
        ) AS exists
      `, [clientId])
    ]).then((results) => ({
      directClientCampaignRows: Boolean(results[0]?.exists),
      socialClientLinks: Boolean(results[1]?.exists),
      campaignAccountMappings: Boolean(results[2]?.exists)
    }))
    : { directClientCampaignRows: false, socialClientLinks: false, campaignAccountMappings: false }

  const ga4PropertyMap = clientId
    ? await queryOne<{ has_property_map: boolean }>(`SELECT EXISTS (SELECT 1 FROM ga4_property_map WHERE client_id = $1) AS has_property_map`, [clientId])
    : { has_property_map: false }
  const ga4Rows = clientId
    ? await queryOne<{ row_count: string }>(`SELECT COUNT(*) AS row_count FROM ga4_daily_channel WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3`, [clientId, startDate, endDate])
    : { row_count: '0' }

  const hasActiveCampaignRows = activeCampaignCount > 0
  if (!hasActiveCampaignRows) {
    if (!activeConnectionCount) {
      issues.push({
        severity: 'error',
        code: 'NO_ACTIVE_CONNECTIONS',
        message: hasPlatformFilter
          ? 'No active ad platform connections for the selected filters.'
          : 'No active ad platform connections are available for the account.'
      })
    }
    if (rawCampaignRows === 0) {
      issues.push({
        severity: 'warning',
        code: 'NO_RAW_ROWS',
        message: 'No synced campaign rows exist in the selected date window.'
      })
    } else {
      issues.push({
        severity: 'warning',
        code: 'INACTIVE_ONLY',
        message: 'Campaign rows exist but are all archived/paused/removed in the selected window.'
      })
    }
    if (clientId && !mappingChecks.directClientCampaignRows && !mappingChecks.socialClientLinks && !mappingChecks.campaignAccountMappings) {
      issues.push({
        severity: 'error',
        code: 'NO_CLIENT_LINK',
        message: 'Selected client is not linked to any ad account or campaign mapping.'
      })
    }
    if (!hasRecentSync) {
      issues.push({
        severity: 'warning',
        code: 'NO_RECENT_SYNC',
        message: lastSyncedAt
          ? `Last campaign sync is older than ${STALE_MINUTES / 60} hours.`
          : 'No campaign sync has run for the selected filter window.'
      })
    }
    if (clientId && !ga4PropertyMap.has_property_map && Number(ga4Rows.row_count || 0) === 0) {
      issues.push({
        severity: 'info',
        code: 'NO_GA4_MAPPING',
        message: 'GA4 is not mapped for this client, so funnel or blended GA4 views may be empty.'
      })
    }
  }

  if (hasActiveCampaignRows && hasRecentSync && syncAge !== null && syncAge > STALE_MINUTES * 2) {
    activeButStale = true
  }

  const response: CampaignHealth = {
    filters: {
      startDate,
      endDate,
      platforms,
      clientId,
    },
    campaign: {
      activeCampaignCount,
      rawCampaignCount: rawCampaignRows,
      campaignsByPlatform: campaignCountsByPlatform,
    },
    connections: {
      active: activeConnectionCount,
      total: connectionRows.length,
      activePlatforms: Array.from(activePlatforms),
      inactive: inactiveConnectionCount,
      inactivePlatforms: Array.from(inactivePlatforms),
      hasActiveForFilters: activeConnectionCount > 0,
      hasActiveButStale: activeButStale,
    },
    sync: {
      lastSyncedAt,
      hasRecentSync,
      syncAgeMinutes: syncAge,
      rawRowsInWindow: rawCampaignRows,
    },
    mapping: mappingChecks,
    ga4: {
      hasPropertyMap: Boolean(ga4PropertyMap?.has_property_map),
      rowsInWindow: Number(ga4Rows.row_count || 0),
    },
    issues,
  }

  return response
})
