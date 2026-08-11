// server/api/crm/activities/index.get.ts
import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Query = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  await requireCrmRecordAccess(context, { type: q.target_type, id: q.target_id })
  const items = await queryRows(
    `SELECT * FROM crm_activities
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
      ORDER BY COALESCE(scheduled_at, created_at) DESC, created_at DESC`,
    [context.clientId, q.target_type, q.target_id],
  )
  return { items }
})
