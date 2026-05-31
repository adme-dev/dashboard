// server/api/client-portal/crm/custom-fields/index.get.ts
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ object_type: z.enum(['person', 'company']) })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_custom_fields WHERE client_id = $1 AND object_type = $2 ORDER BY position, label`,
    [client.clientId, q.object_type],
  )
  return { items }
})
