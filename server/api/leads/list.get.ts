// server/api/leads/list.get.ts
// Filtered + paginated agency lead list.

import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.string().uuid().optional(),
  source: z.enum(['meta', 'google', 'manual']).optional(),
  form_id: z.string().optional(),
  status: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  unmapped: z.coerce.boolean().optional(),
  include_test: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const conds: string[] = ['deleted_at IS NULL']
  const params: any[] = []
  const push = (c: string, v: any) => { params.push(v); conds.push(c.replace('?', '$' + params.length)) }

  if (q.client_id) push('client_id = ?', q.client_id)
  if (q.unmapped) conds.push('client_id IS NULL')
  if (!q.include_test) conds.push('is_test = false')
  if (q.source) push('source = ?', q.source)
  if (q.form_id) push('form_id = ?', q.form_id)
  if (q.status) push('status = ?', q.status)
  if (q.assigned_to) push('assigned_to = ?', q.assigned_to)
  if (q.from) push('submitted_at >= ?', q.from)
  if (q.to) push('submitted_at < (?::date + INTERVAL \'1 day\')', q.to)
  if (q.q) {
    // Search in JSONB serialized form (escape % and _ to neutralize ILIKE meta)
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    push(`field_data::text ILIKE ?`, `%${safe}%`)
  }

  const where = `WHERE ${conds.join(' AND ')}`
  const offset = (q.page - 1) * q.page_size

  const rows = await queryRows(`
    SELECT * FROM leads ${where}
    ORDER BY submitted_at DESC
    LIMIT ${q.page_size} OFFSET ${offset}
  `, params)
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM leads ${where}`, params)
  return { items: rows, total, page: q.page, page_size: q.page_size }
})
