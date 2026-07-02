import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/slots?clientId=
 * List a client's recurring posting slots.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  return await queryRows(
    `SELECT id, client_id, name, platforms, day_of_week, time_of_day, timezone, capacity, enabled
       FROM social_slot_schedules
      WHERE client_id = $1
      ORDER BY day_of_week, time_of_day`,
    [clientId],
  )
})
