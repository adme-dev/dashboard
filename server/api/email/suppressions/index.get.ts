// server/api/email/suppressions/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryCount, queryRows } from '~~/server/utils/db'
import {
  addEmailClientScopeCondition,
  resolveEmailClientScope
} from '~~/server/utils/email-marketing/access'

const Query = z.object({
  q: z.string().trim().optional(),
  reason: z.enum(['hard_bounce', 'complaint', 'manual', 'global_unsubscribe', 'soft_bounce']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50)
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parsed = Query.parse(getQuery(event))
  const params: unknown[] = []
  const conds: string[] = []
  const clientIds = await resolveEmailClientScope(event, user)
  addEmailClientScopeCondition(conds, params, 's.client_id', clientIds)

  if (parsed.reason) {
    params.push(parsed.reason)
    conds.push(`sup.reason = $${params.length}`)
  }
  if (parsed.q) {
    params.push(`%${parsed.q.replace(/[%_]/g, c => '\\' + c)}%`)
    conds.push(`(sup.email ILIKE $${params.length} ESCAPE '\\' OR s.name ILIKE $${params.length} ESCAPE '\\')`)
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const offset = (parsed.page - 1) * parsed.page_size

  const items = await queryRows(`
    SELECT
      sup.email::text,
      sup.reason,
      sup.campaign_id,
      sup.created_at,
      sup.updated_at,
      s.id AS subscriber_id,
      s.name AS subscriber_name,
      s.status AS subscriber_status
    FROM suppression_list sup
    LEFT JOIN email_subscribers s ON s.email = sup.email
    ${where}
    ORDER BY sup.created_at DESC
    LIMIT ${parsed.page_size} OFFSET ${offset}
  `, params)

  const total = await queryCount(`
    SELECT COUNT(*)::text AS count
    FROM suppression_list sup
    LEFT JOIN email_subscribers s ON s.email = sup.email
    ${where}
  `, params)

  return {
    items,
    total,
    page: parsed.page,
    page_size: parsed.page_size
  }
})
