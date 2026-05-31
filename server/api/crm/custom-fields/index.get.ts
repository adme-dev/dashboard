// server/api/crm/custom-fields/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid(), object_type: z.enum(['person', 'company']) })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_custom_fields WHERE client_id = $1 AND object_type = $2 ORDER BY position, label`,
    [q.client_id, q.object_type],
  )
  return { items }
})
