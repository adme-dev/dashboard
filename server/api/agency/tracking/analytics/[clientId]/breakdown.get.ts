/** Ranked breakdown by a fixed dimension. GET …/:clientId/breakdown?dimension=&from&to&limit */
import { query } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'

// Maps the allowlisted dimension to a SQL grouping expression. Keys are the ONLY
// accepted values, so the expression is never user-controlled.
const DIMENSIONS: Record<string, string> = {
  source: `COALESCE(NULLIF(utm_source, ''), '(none)')`,
  medium: `COALESCE(NULLIF(utm_medium, ''), '(none)')`,
  campaign: `COALESCE(NULLIF(utm_campaign, ''), '(none)')`,
  page: `COALESCE(NULLIF(page_url, ''), '(none)')`,
  referrer: `COALESCE(NULLIF(referrer, ''), '(direct)')`,
  event_name: `event_name`,
  paid_organic: `CASE
      WHEN gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL
        OR fbclid IS NOT NULL OR msclkid IS NOT NULL OR ttclid IS NOT NULL THEN 'paid'
      WHEN NULLIF(utm_source,'') IS NOT NULL OR NULLIF(referrer,'') IS NOT NULL THEN 'organic'
      ELSE 'direct' END`
}

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const q = getQuery(event) as { dimension?: string, from?: string, to?: string, limit?: string }
  const range = parseRange(q)
  const limit = Math.min(Math.max(parseInt(q.limit || '10', 10) || 10, 1), 50)
  const dimension = q.dimension || 'source'

  // Device dimension: classify UA buckets in SQL (mobile/tablet/desktop).
  if (dimension === 'device') {
    const rows = await query<any>(
      `SELECT CASE
          WHEN ua ~* '(iPad|Tablet)' OR (ua ~* 'Android' AND ua !~* 'Mobile') THEN 'tablet'
          WHEN ua ~* '(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)' THEN 'mobile'
          WHEN ua IS NULL THEN 'unknown'
          ELSE 'desktop' END AS key,
          COUNT(*) AS count
         FROM tracking_events e
        WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
        GROUP BY key ORDER BY count DESC`,
      [clientId, range.from.toISOString(), range.toExclusive.toISOString()]
    )
    return { dimension, rows: rows.map(r => ({ key: r.key, count: Number(r.count) })) }
  }

  const expr = DIMENSIONS[dimension]
  if (!expr) throw createError({ statusCode: 400, statusMessage: 'Unknown dimension' })

  // $1 clientId, $2 from, $3 toExclusive, $4 limit
  const rows = await query<any>(
    `SELECT ${expr} AS key, COUNT(*) AS count
       FROM tracking_events e
      WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
      GROUP BY key ORDER BY count DESC LIMIT $4`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString(), limit]
  )
  return { dimension, rows: rows.map(r => ({ key: r.key, count: Number(r.count) })) }
})
