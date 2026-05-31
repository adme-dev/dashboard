// server/api/client-portal/crm/companies/index.get.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const conds: Cond[] = []
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    conds.push({ sql: '(name ILIKE ? OR domain ILIKE ?)', params: [`%${safe}%`, `%${safe}%`] })
  }
  const { where, params } = buildWhere(client.clientId, conds)
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_companies ${where} ORDER BY name ASC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_companies ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
