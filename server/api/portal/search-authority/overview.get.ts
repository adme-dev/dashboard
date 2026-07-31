import { queryOne, queryRows } from '~~/server/utils/db'
import { requirePortalSearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { searchConsoleOpportunityWindow } from '~~/server/utils/searchAuthority/dates'

interface ProviderRow {
  connection_status: string | null
  data_through_date: string | null
  provisional: boolean
}

interface MetricsRow {
  clicks: string
  impressions: string
  ctr: string
  position: string
  previous_clicks: string
  previous_impressions: string
  coverage_days: string
  previous_coverage_days: string
}

interface ActionRow {
  opportunity_type: string
  lifecycle_status: string
}

function previousWindow(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1)
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
    days
  }
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function actionLabel(type: string): string {
  const labels: Record<string, string> = {
    low_ctr: 'Search result improvement',
    striking_distance: 'Ranking improvement',
    declining: 'Visibility recovery',
    growth: 'Growth protection',
    indexing: 'Indexing improvement',
    technical: 'Technical trust improvement'
  }
  return labels[type] || 'Search visibility improvement'
}

export default eventHandler(async (event) => {
  const user = await requirePortalSearchAuthorityAccess(event)
  const window = searchConsoleOpportunityWindow()
  const previous = previousWindow(window.startDate, window.endDate)

  const [provider, metricsRow, actionRows] = await Promise.all([
    queryOne<ProviderRow>(
      `SELECT
         connection.status AS connection_status,
         map.data_through_date,
         EXISTS (
           SELECT 1
           FROM gsc_daily_property evidence
           WHERE evidence.client_id = map.client_id
             AND evidence.property_map_id = map.id
             AND evidence.metric_date BETWEEN $2::date AND $3::date
             AND evidence.provisional = TRUE
         ) AS provisional
       FROM search_console_property_maps map
       JOIN search_console_connections connection
         ON connection.client_id = map.client_id
        AND connection.id = map.connection_id
       WHERE map.client_id = $1
         AND map.status IN ('active', 'restricted')
       ORDER BY map.updated_at DESC
       LIMIT 1`,
      [user.clientId, window.startDate, window.endDate]
    ),
    queryOne<MetricsRow>(
      `SELECT
         COALESCE(SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0) AS clicks,
         COALESCE(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0) AS impressions,
         COALESCE((SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ))::numeric / NULLIF(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0), 0) AS ctr,
         COALESCE(SUM(position * impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ) / NULLIF(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0), 0) AS position,
         COALESCE(SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ), 0) AS previous_clicks,
         COALESCE(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ), 0) AS previous_impressions,
         COUNT(DISTINCT metric_date) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ) AS coverage_days,
         COUNT(DISTINCT metric_date) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ) AS previous_coverage_days
       FROM gsc_daily_property
       WHERE client_id = $1
         AND search_type = 'web'
         AND metric_date BETWEEN $4::date AND $3::date`,
      [
        user.clientId,
        window.startDate,
        window.endDate,
        previous.startDate,
        previous.endDate
      ]
    ),
    queryRows<ActionRow>(
      `SELECT opportunity_type, lifecycle_status
       FROM search_authority_opportunities
       WHERE client_id = $1
         AND lifecycle_status IN (
           'accepted', 'task_created', 'in_progress',
           'published', 'measuring', 'closed'
         )
       ORDER BY last_detected_at DESC
       LIMIT 20`,
      [user.clientId]
    )
  ])

  const clicks = Number(metricsRow?.clicks || 0)
  const impressions = Number(metricsRow?.impressions || 0)
  const previousClicks = Number(metricsRow?.previous_clicks || 0)
  const previousImpressions = Number(metricsRow?.previous_impressions || 0)
  const currentCoverage = Number(metricsRow?.coverage_days || 0)
  const previousCoverage = Number(metricsRow?.previous_coverage_days || 0)
  const comparisonComplete = previousCoverage >= previous.days
  const available = Boolean(provider && currentCoverage > 0)
  const caveats: string[] = []
  if (!available) caveats.push('Search evidence is not available yet.')
  if (provider?.provisional) {
    caveats.push('Google marks part of the current window as provisional.')
  }
  if (currentCoverage < previous.days) {
    caveats.push('The current reporting window is incomplete.')
  }
  if (!comparisonComplete) {
    caveats.push('Period change is unavailable until the comparison window is complete.')
  }

  return {
    clientName: user.clientName,
    window,
    provider: {
      status: provider?.connection_status || 'not_connected',
      dataThroughDate: provider?.data_through_date || null,
      provisional: Boolean(provider?.provisional),
      available,
      caveats
    },
    visibility: {
      clicks,
      impressions,
      ctr: Number(metricsRow?.ctr || 0),
      position: Number(metricsRow?.position || 0),
      clickChangePercent: comparisonComplete
        ? percentChange(clicks, previousClicks)
        : null,
      impressionChangePercent: comparisonComplete
        ? percentChange(impressions, previousImpressions)
        : null
    },
    actions: {
      total: actionRows.length,
      items: actionRows.map(row => ({
        label: actionLabel(row.opportunity_type),
        status: row.lifecycle_status
      }))
    },
    nextSteps: actionRows.length > 0
      ? ['Your agency is reviewing and delivering the approved search actions shown here.']
      : ['Your agency will review new evidence before recommending any action.']
  }
})
