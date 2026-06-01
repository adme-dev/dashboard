// server/api/crm/assignment-rules/index.get.ts — list a client's assignment rules.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT id, object_type, strategy, pool, assignment_index, is_active, created_at
       FROM crm_assignment_rules
      WHERE client_id = $1
      ORDER BY object_type, created_at`,
    [client_id],
  )
  return { items }
})
