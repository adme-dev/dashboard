/** GET /api/agency/social/news — selectable MCP/news inbox. */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { normalizeSocialNewsClientProfile } from '~~/server/utils/socialNewsProfile'
import { scoreNewsForClient } from '~~/server/utils/socialNews'

interface SocialNewsRow {
  id: string
  source: string
  external_id: string
  source_url: string | null
  title: string
  summary: string | null
  author: string | null
  published_at: string | null
  status: string
  linked_post_id: string | null
  raw: Record<string, unknown> | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const q = getQuery(event)
  const status = typeof q.status === 'string' && ['unread', 'selected', 'dismissed', 'used'].includes(q.status) ? q.status : null
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const clientId = typeof q.clientId === 'string' ? q.clientId : ''
  const search = typeof q.q === 'string' ? q.q.trim().slice(0, 200) : ''
  const topic = typeof q.topic === 'string' ? q.topic.trim().toLocaleLowerCase().slice(0, 100) : ''
  const make = typeof q.make === 'string' ? q.make.trim().toLocaleLowerCase().slice(0, 100) : ''
  const source = typeof q.source === 'string' ? q.source.trim().slice(0, 100) : ''
  const relevantOnly = q.relevantOnly === 'true'
  const params: unknown[] = []
  let join = ''
  let stateStatus = 'n.status'
  let linkedPost = 'n.linked_post_id'
  let profile = normalizeSocialNewsClientProfile()
  if (clientId) {
    await requireSocialClientAccess(event, clientId)
    join = `LEFT JOIN social_news_client_item_states s ON s.news_item_id = n.id AND s.client_id = $${params.push(clientId)}`
    stateStatus = `COALESCE(s.status, 'unread')`
    linkedPost = 's.linked_post_id'
    const [row] = await queryRows<Record<string, unknown>>(
      `SELECT p.*, c.name AS client_name, COALESCE(p.industry, c.industry) AS industry,
              COALESCE(p.timezone, c.reporting_timezone, 'Australia/Melbourne') AS timezone
         FROM agency_clients c
         LEFT JOIN social_news_client_profiles p ON p.client_id = c.id
        WHERE c.id = $1`, [clientId],
    )
    if (row) profile = normalizeSocialNewsClientProfile({ ...row, client_id: clientId })
  }
  const where = status ? [`${stateStatus} = $${params.push(status)}`] : []
  if (source) where.push(`n.source = $${params.push(source)}`)
  if (search) where.push(`(n.title ILIKE $${params.push(`%${search}%`)} OR n.summary ILIKE $${params.length})`)
  params.push(200)
  const rows = await queryRows<SocialNewsRow>(
    `SELECT n.id, n.source, n.external_id, n.source_url, n.title, n.summary, n.author,
            n.published_at, ${stateStatus} AS status, ${linkedPost} AS linked_post_id, n.raw, n.created_at
       FROM social_news_items n ${join} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $${params.length}`,
    params,
  )
  return rows
    .map((row) => {
      const relevance = clientId ? scoreNewsForClient(row, profile) : { score: 0, reasons: [], excluded: false }
      const topics: string[] = Array.isArray(row.raw?.topics) ? row.raw.topics.filter((value): value is string => typeof value === 'string') : []
      return {
        ...row,
        topics,
        make: typeof row.raw?.make === 'string' ? row.raw.make : null,
        image_url: typeof row.raw?.image === 'string' ? row.raw.image : null,
        relevance_score: relevance.score,
        relevance_reasons: relevance.reasons,
        excluded: relevance.excluded,
      }
    })
    .filter(row => !topic || row.topics.some((value: string) => value.toLocaleLowerCase().includes(topic)))
    .filter(row => !make || String(row.make || '').toLocaleLowerCase().includes(make))
    .filter(row => !relevantOnly || (!row.excluded && row.relevance_score > 0))
    .sort((a, b) => b.relevance_score - a.relevance_score || new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime())
    .slice(0, limit)
})
