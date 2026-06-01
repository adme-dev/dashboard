// server/api/client-portal/crm/audit/index.get.ts — session-scoped (read-only).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({
  entity_type: z.enum(['person', 'company', 'opportunity', 'record']),
  entity_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT a.id, a.field, a.old_value, a.new_value, a.changed_at, a.changed_by, u.name AS changed_by_name
       FROM crm_audit_log a
       LEFT JOIN team_members u ON u.id = a.changed_by
      WHERE a.client_id = $1 AND a.entity_type = $2 AND a.entity_id = $3
      ORDER BY a.changed_at DESC
      LIMIT ${q.limit}`,
    [client.clientId, q.entity_type, q.entity_id],
  )
  return { items }
})
