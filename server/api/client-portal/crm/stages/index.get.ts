// server/api/client-portal/crm/stages/index.get.ts — session-scoped.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { resolveStages, type StageRow } from '~~/server/utils/crm/stages'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const globals = await queryRows<StageRow>(`SELECT * FROM crm_stages WHERE client_id IS NULL AND is_active = true`)
  const clientStages = await queryRows<StageRow>(`SELECT * FROM crm_stages WHERE client_id = $1 AND is_active = true`, [client.clientId])
  return { items: resolveStages(globals, clientStages) }
})
