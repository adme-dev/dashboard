// server/api/crm/people/index.get.ts
// Client-scoped, paginated, searchable people list (optionally filtered by company).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const conds: Cond[] = []
  if (q.company_id) conds.push({ sql: 'company_id = ?', params: [q.company_id] })
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    const like = `%${safe}%`
    conds.push({ sql: '(first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?)', params: [like, like, like] })
  }
  const { where, params } = buildWhere(q.client_id, conds)
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_people ${where} ORDER BY last_name NULLS LAST, first_name LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_people ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
