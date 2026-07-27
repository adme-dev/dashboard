import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { parsePortalTrackingRange } from '~~/server/utils/tracking/portalRange'

const DIMENSIONS: Record<string, string> = {
  source: `COALESCE(NULLIF(utm_source, ''), '(none)')`,
  medium: `COALESCE(NULLIF(utm_medium, ''), '(none)')`,
  campaign: `COALESCE(NULLIF(utm_campaign, ''), '(none)')`,
  page: `COALESCE(NULLIF(page_url, ''), '(none)')`,
  referrer: `COALESCE(NULLIF(referrer, ''), '(direct)')`,
  event_name: 'event_name'
}
const DEVICE_SQL = `CASE
  WHEN ua ~* '(iPad|Tablet)' OR (ua ~* 'Android' AND ua !~* 'Mobile') THEN 'tablet'
  WHEN ua ~* '(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)' THEN 'mobile'
  WHEN ua IS NULL THEN 'unknown'
  ELSE 'desktop' END`

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const query = getQuery(event) as { dimension?: string, limit?: string }
  const dimension = query.dimension || 'source'
  const expression = dimension === 'device' ? DEVICE_SQL : DIMENSIONS[dimension]
  if (!expression) throw createError({ statusCode: 400, statusMessage: 'Unknown dimension' })

  const { fromDate, toDate } = parsePortalTrackingRange(event)
  const timezone = await resolveClientTimezone(client.clientId)
  const limit = Math.min(Math.max(Number.parseInt(query.limit || '10', 10) || 10, 1), 50)
  const rows = await queryRows<{ key: string, count: string }>(
    `SELECT ${expression} AS key, COUNT(*) AS count
       FROM tracking_events e
      WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
      GROUP BY key
      ORDER BY count DESC
      LIMIT $5`,
    [client.clientId, fromDate, toDate, timezone, limit]
  )
  return {
    dimension,
    rows: rows.map(row => ({ key: String(row.key), count: Number(row.count) || 0 }))
  }
})
