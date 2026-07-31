import { getQuery } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import {
  searchConsoleOpportunityWindow,
  searchConsoleSyncWindow
} from '~~/server/utils/searchAuthority/dates'

const Query = z.object({
  clientId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

interface ProviderRow {
  site_status: string | null
  connection_status: string | null
  last_success_at: string | null
  last_error_message: string | null
  data_through_date: string | null
  provisional_from_date: string | null
}

interface MetricsRow {
  current_clicks: string
  current_impressions: string
  current_ctr: string
  current_position: string
  previous_clicks: string
  previous_impressions: string
  coverage_days: string
  previous_coverage_days: string
  provisional: boolean | null
}

interface OpportunityCountRow {
  total: string
  new_count: string
  under_review_count: string
  accepted_count: string
  task_created_count: string
}

function priorWindow(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1)
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10)
  }
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function inclusiveDays(startDate: string, endDate: string): number {
  return Math.floor((
    new Date(`${endDate}T00:00:00.000Z`).getTime()
      - new Date(`${startDate}T00:00:00.000Z`).getTime()
  ) / 86_400_000) + 1
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid client and date window are required'
    })
  }

  let window: { startDate: string, endDate: string }
  try {
    if (parsed.data.startDate || parsed.data.endDate) {
      const manual = searchConsoleSyncWindow({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate
      })
      window = {
        startDate: manual.startDate,
        endDate: manual.endDate
      }
    } else {
      window = searchConsoleOpportunityWindow()
    }
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'The date window must be valid and no longer than 90 days'
    })
  }

  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const previous = priorWindow(window.startDate, window.endDate)

  const [provider, metricsRow, opportunityCounts] = await Promise.all([
    queryOne<ProviderRow>(
      `SELECT
         site.status AS site_status,
         connection.status AS connection_status,
         connection.last_success_at,
         connection.last_error_message,
         map.data_through_date,
         map.provisional_from_date
       FROM search_authority_sites site
       LEFT JOIN search_console_property_maps map
         ON map.client_id = site.client_id
        AND map.site_id = site.id
        AND map.status IN ('active', 'restricted')
       LEFT JOIN search_console_connections connection
         ON connection.client_id = map.client_id
        AND connection.id = map.connection_id
       WHERE site.client_id = $1
       ORDER BY map.updated_at DESC NULLS LAST
       LIMIT 1`,
      [parsed.data.clientId]
    ),
    queryOne<MetricsRow>(
      `SELECT
         COALESCE(SUM(data.clicks) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ), 0) AS current_clicks,
         COALESCE(SUM(data.impressions) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ), 0) AS current_impressions,
         COALESCE((SUM(data.clicks) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ))::numeric / NULLIF(SUM(data.impressions) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ), 0), 0) AS current_ctr,
         COALESCE(SUM(data.position * data.impressions) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ) / NULLIF(SUM(data.impressions) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ), 0), 0) AS current_position,
         COALESCE(SUM(data.clicks) FILTER (
           WHERE data.metric_date BETWEEN $4::date AND $5::date
         ), 0) AS previous_clicks,
         COALESCE(SUM(data.impressions) FILTER (
           WHERE data.metric_date BETWEEN $4::date AND $5::date
         ), 0) AS previous_impressions,
         COUNT(DISTINCT data.metric_date) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ) AS coverage_days,
         COUNT(DISTINCT data.metric_date) FILTER (
           WHERE data.metric_date BETWEEN $4::date AND $5::date
         ) AS previous_coverage_days,
         BOOL_OR(data.provisional) FILTER (
           WHERE data.metric_date BETWEEN $2::date AND $3::date
         ) AS provisional
       FROM gsc_daily_property data
       JOIN search_console_property_maps map
         ON map.client_id = data.client_id
        AND map.id = data.property_map_id
        AND map.status IN ('active', 'restricted')
       WHERE data.client_id = $1
         AND data.search_type = 'web'
         AND data.metric_date BETWEEN $4::date AND $3::date`,
      [
        parsed.data.clientId,
        window.startDate,
        window.endDate,
        previous.startDate,
        previous.endDate
      ]
    ),
    queryOne<OpportunityCountRow>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE lifecycle_status = 'new') AS new_count,
         COUNT(*) FILTER (WHERE lifecycle_status = 'under_review') AS under_review_count,
         COUNT(*) FILTER (WHERE lifecycle_status = 'accepted') AS accepted_count,
         COUNT(*) FILTER (WHERE lifecycle_status = 'task_created') AS task_created_count
       FROM search_authority_opportunities
       WHERE client_id = $1`,
      [parsed.data.clientId]
    )
  ])

  const currentClicks = Number(metricsRow?.current_clicks || 0)
  const currentImpressions = Number(metricsRow?.current_impressions || 0)
  const previousClicks = Number(metricsRow?.previous_clicks || 0)
  const previousImpressions = Number(metricsRow?.previous_impressions || 0)
  const dataThroughDate = provider?.data_through_date || null
  const provisional = Boolean(metricsRow?.provisional)
  const expectedCoverageDays = inclusiveDays(window.startDate, window.endDate)
  const currentCoverageDays = Number(metricsRow?.coverage_days || 0)
  const previousCoverageDays = Number(metricsRow?.previous_coverage_days || 0)
  const comparisonComplete = previousCoverageDays >= expectedCoverageDays
  const stale = provider?.connection_status !== 'active'
    || !dataThroughDate
    || dataThroughDate < window.endDate
  const caveats: string[] = []
  if (!provider) {
    caveats.push('Search Console is not connected for this client.')
  } else {
    if (provider.connection_status === 'degraded') {
      caveats.push('The Search Console connection is degraded; showing the last successful evidence.')
    }
    if (provisional) {
      caveats.push('Google marks part of this reporting window as provisional.')
    }
    if (currentCoverageDays < expectedCoverageDays) {
      caveats.push('The selected reporting window has incomplete Search Console coverage.')
    }
    if (!comparisonComplete) {
      caveats.push('The preceding comparison window is incomplete, so period change is unavailable.')
    }
    if (dataThroughDate && dataThroughDate < window.endDate) {
      caveats.push(`Search evidence is currently available through ${displayDate(dataThroughDate)}.`)
    }
    if (provider.last_error_message) {
      caveats.push(provider.last_error_message)
    }
  }

  return {
    window,
    provider: {
      siteStatus: provider?.site_status || 'not_configured',
      connectionStatus: provider?.connection_status || 'not_connected',
      lastSuccessAt: provider?.last_success_at || null,
      dataThroughDate,
      provisionalFromDate: provider?.provisional_from_date || null,
      provisional,
      stale,
      caveats
    },
    metrics: {
      clicks: currentClicks,
      impressions: currentImpressions,
      ctr: Number(metricsRow?.current_ctr || 0),
      position: Number(metricsRow?.current_position || 0),
      clickChangePercent: comparisonComplete
        ? percentChange(currentClicks, previousClicks)
        : null,
      impressionChangePercent: comparisonComplete
        ? percentChange(currentImpressions, previousImpressions)
        : null
    },
    opportunities: {
      total: Number(opportunityCounts?.total || 0),
      new: Number(opportunityCounts?.new_count || 0),
      underReview: Number(opportunityCounts?.under_review_count || 0),
      accepted: Number(opportunityCounts?.accepted_count || 0),
      taskCreated: Number(opportunityCounts?.task_created_count || 0)
    }
  }
})
