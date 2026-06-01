// server/api/client-portal/crm/tasks/index.get.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { buildWhere } from '~~/server/utils/crm/queryScope'
import { buildTaskFilter, deriveStatus } from '~~/server/utils/crm/tasks'

const Query = z.object({
  target_type: z.enum(['person', 'company', 'opportunity']).optional(),
  target_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled', 'overdue']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  task_type: z.enum(['call', 'email', 'sms', 'meeting', 'follow_up', 'general']).optional(),
  assigned_to: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const now = new Date()
  const { where, params } = buildWhere(client.clientId, buildTaskFilter(q, now))

  const total = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM crm_tasks ${where}`,
    params,
  )
  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2
  const rows = await queryRows(
    `SELECT * FROM crm_tasks ${where}
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
               due_at ASC NULLS LAST, created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...params, q.page_size, (q.page - 1) * q.page_size],
  )
  const items = rows.map(r => ({ ...r, derived_status: deriveStatus(r as { status: string, due_at: string | null }, now) }))
  return { items, total: Number(total?.count ?? 0), page: q.page, page_size: q.page_size }
})
