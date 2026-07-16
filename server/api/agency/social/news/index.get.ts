/** GET /api/agency/social/news — selectable MCP/news inbox. */
import { requirePermission } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const q = getQuery(event)
  const status = typeof q.status === 'string' && ['unread', 'selected', 'dismissed', 'used'].includes(q.status) ? q.status : null
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const params: unknown[] = []
  const where = status ? [`status = $${params.push(status)}`] : []
  params.push(limit)
  return queryRows(
    `SELECT id, source, external_id, source_url, title, summary, author, published_at, status, linked_post_id, created_at
       FROM social_news_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT $${params.length}`,
    params,
  )
})
