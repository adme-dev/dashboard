import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/listening/mentions?clientId=&queryId=&source=&sentiment=&limit=&offset= */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const where: string[] = ['client_id = $1']
  const params: any[] = [clientId]
  const add = (frag: string, val: any) => { params.push(val); where.push(frag.replace('$?', `$${params.length}`)) }
  if (q.queryId) add('query_id = $?', q.queryId)
  if (q.source) add('source = $?', String(q.source))
  if (q.sentiment) add('sentiment = $?', String(q.sentiment))

  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  params.push(limit, offset)
  return queryRows(
    `SELECT * FROM social_listening_mentions WHERE ${where.join(' AND ')}
       ORDER BY published_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params)
})
