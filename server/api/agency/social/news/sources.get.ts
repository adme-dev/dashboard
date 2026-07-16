/** GET /api/agency/social/news/sources — configurable news plug-ins. */
import { requirePermission } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { sourceFromRow } from '~~/server/utils/socialNewsSources'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const rows = await queryRows('SELECT source_key, display_name, endpoint_url, enabled, settings FROM social_news_sources ORDER BY display_name')
  return { sources: rows.map(sourceFromRow) }
})
