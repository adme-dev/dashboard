// server/api/crm/object-defs/[id]/field-defs/index.get.ts — fields for one object def.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const objectDefId = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_field_defs WHERE object_def_id = $1 AND client_id = $2 ORDER BY position, label`,
    [objectDefId, client_id],
  )
  return { items }
})
