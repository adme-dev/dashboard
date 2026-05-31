// server/api/crm/activities/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_activities
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
      ORDER BY COALESCE(scheduled_at, created_at) DESC, created_at DESC`,
    [q.client_id, q.target_type, q.target_id],
  )
  return { items }
})
