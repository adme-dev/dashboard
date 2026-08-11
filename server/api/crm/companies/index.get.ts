// server/api/crm/companies/index.get.ts
// Client-scoped, paginated, searchable company list.
import { z } from 'zod'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, visibilityCondsForContext, type Cond } from '~~/server/utils/crm/queryScope'
import { buildFilterConds, parseFilters } from '~~/server/utils/crm/filters'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  q: z.string().optional(),
  lifecycle: z.string().optional(),
  tag: z.string().optional(),
  filters: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })

  const conds: Cond[] = []
  conds.push(...visibilityCondsForContext(context, 'company', 'crm_companies'))
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    conds.push({ sql: '(name ILIKE ? OR domain ILIKE ?)', params: [`%${safe}%`, `%${safe}%`] })
  }
  if (q.lifecycle) conds.push({ sql: 'lifecycle_stage = ?', params: [q.lifecycle] })
  if (q.tag) conds.push({ sql: '? = ANY(tags)', params: [q.tag] })
  conds.push(...buildFilterConds('companies', parseFilters(q.filters)))
  const { where, params } = buildWhere(context.clientId, conds)
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_companies ${where} ORDER BY name ASC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_companies ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
