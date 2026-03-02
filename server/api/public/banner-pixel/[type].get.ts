/**
 * Tracking pixel for banner impressions and clicks.
 * GET /api/public/banner-pixel/:type?p=publishedId
 * GET /api/public/banner-pixel/:type?pid=projectId&fk=formatKey
 * type = 'impression' or 'click'
 * Returns a 1x1 transparent GIF.
 * No auth required — public endpoint.
 */
import { execute, queryOne } from '~~/server/utils/db'

// 1x1 transparent GIF (43 bytes)
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export default defineEventHandler(async (event) => {
  const type = getRouterParam(event, 'type')
  const { p, pid, fk } = getQuery(event) as { p?: string; pid?: string; fk?: string }

  // Return pixel immediately regardless of DB result
  setResponseHeaders(event, {
    'Content-Type': 'image/gif',
    'Content-Length': String(PIXEL_GIF.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  })

  // Resolve published_id
  let publishedId = p
  if (!publishedId && pid && fk) {
    try {
      const row = await queryOne(
        'SELECT id FROM banner_published WHERE project_id = $1 AND format_key = $2',
        [pid, fk],
      ) as any
      publishedId = row?.id
    } catch {
      // Non-critical
    }
  }

  // Fire-and-forget analytics recording
  if (publishedId && (type === 'impression' || type === 'click')) {
    const column = type === 'impression' ? 'impressions' : 'clicks'
    try {
      await execute(`
        INSERT INTO banner_analytics (published_id, date, ${column})
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (published_id, date)
        DO UPDATE SET ${column} = banner_analytics.${column} + 1
      `, [publishedId])
    } catch {
      // Non-critical — don't block pixel response
    }
  }

  return PIXEL_GIF
})
