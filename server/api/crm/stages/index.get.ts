// server/api/crm/stages/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { resolveStages, type StageRow } from '~~/server/utils/crm/stages'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const globals = await queryRows<StageRow>(`SELECT * FROM crm_stages WHERE client_id IS NULL AND is_active = true`)
  const client = await queryRows<StageRow>(`SELECT * FROM crm_stages WHERE client_id = $1 AND is_active = true`, [client_id])
  return { items: resolveStages(globals, client) }
})
