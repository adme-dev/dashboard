// server/api/client-portal/crm/activities/index.get.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_activities
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
      ORDER BY COALESCE(scheduled_at, created_at) DESC, created_at DESC`,
    [client.clientId, q.target_type, q.target_id],
  )
  return { items }
})
