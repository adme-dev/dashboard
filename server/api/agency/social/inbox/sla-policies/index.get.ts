import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/sla-policies?clientId= */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return await queryRows(`SELECT * FROM social_sla_policies WHERE client_id = $1 ORDER BY channel_type NULLS FIRST`, [clientId])
})
