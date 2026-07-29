// server/api/leads/list.get.ts
// Filtered + paginated agency lead list.

import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { safeEmailLeadPresentationSelect } from '~~/server/utils/leads/leadPresentation'

const Query = z.object({
  client_id: z.string().uuid().optional(),
  source: z.enum(['meta', 'google', 'manual', 'webhook', 'csv', 'email']).optional(),
  form_id: z.string().optional(),
  status: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  unmapped: z.coerce.boolean().optional(),
  include_test: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50)
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const conds: string[] = ['l.deleted_at IS NULL']
  const params: unknown[] = []
  const push = (condition: string, value: unknown) => {
    params.push(value)
    conds.push(condition.replace('?', '$' + params.length))
  }

  if (q.client_id) push('l.client_id = ?', q.client_id)
  if (q.unmapped) conds.push('l.client_id IS NULL')
  if (!q.include_test) conds.push('l.is_test = false')
  if (q.source) push('l.source = ?', q.source)
  if (q.form_id) push('l.form_id = ?', q.form_id)
  if (q.status) push('l.status = ?', q.status)
  if (q.assigned_to) push('l.assigned_to = ?', q.assigned_to)
  if (q.campaign_id) push('l.campaign_id = ?', q.campaign_id)
  if (q.campaign_name) push('l.campaign_name = ?', q.campaign_name)
  if (q.from) push('l.submitted_at >= ?', q.from)
  if (q.to) push('l.submitted_at < (?::date + INTERVAL \'1 day\')', q.to)
  if (q.q) {
    // Search in JSONB serialized form (escape % and _ to neutralize ILIKE meta)
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    push(`l.field_data::text ILIKE ?`, `%${safe}%`)
  }

  const where = `WHERE ${conds.join(' AND ')}`
  const offset = (q.page - 1) * q.page_size

  const rows = await queryRows(`
    SELECT l.*, ${safeEmailLeadPresentationSelect('l')}
    FROM leads l ${where}
    ORDER BY l.submitted_at DESC
    LIMIT ${q.page_size} OFFSET ${offset}
  `, params)
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM leads l ${where}`, params)
  return { items: rows, total, page: q.page, page_size: q.page_size }
})
