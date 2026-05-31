// server/api/crm/opportunities/index.get.ts
// Client-scoped opportunity list with person/company names. Joined query, so the WHERE is
// built directly with `o.`-aliased columns (always client_id-scoped + soft-delete).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.string().uuid(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(200),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const params: unknown[] = [q.client_id]
  const conds: string[] = ['o.deleted_at IS NULL', 'o.client_id = $1']
  if (q.stage_id) { params.push(q.stage_id); conds.push(`o.stage_id = $${params.length}`) }
  if (q.status) { params.push(q.status); conds.push(`o.status = $${params.length}`) }
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    params.push(`%${safe}%`); conds.push(`o.name ILIKE $${params.length}`)
  }
  const where = `WHERE ${conds.join(' AND ')}`
  const offset = (q.page - 1) * q.page_size

  const items = await queryRows(
    `SELECT o.*,
            (p.first_name || ' ' || COALESCE(p.last_name,'')) AS person_name,
            c.name AS company_name
       FROM crm_opportunities o
       LEFT JOIN crm_people p ON p.id = o.person_id
       LEFT JOIN crm_companies c ON c.id = o.company_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_opportunities o ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
