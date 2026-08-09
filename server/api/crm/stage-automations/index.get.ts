// server/api/crm/stage-automations/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const items = await queryRows(
    `SELECT a.*, s.name AS stage_name, s.code AS stage_code
       FROM crm_stage_automations a
       JOIN crm_stages s ON s.id = a.stage_id
      WHERE a.client_id = $1
      ORDER BY s.sort_order, a.created_at`,
    [context.clientId],
  )
  return { items }
})
