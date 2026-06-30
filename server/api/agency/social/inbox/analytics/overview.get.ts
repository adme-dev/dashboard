import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSocialInboxAnalytics } from '~~/server/utils/socialInbox/analytics'

/**
 * GET /api/agency/social/inbox/analytics/overview?clientId=&days=30
 * Response-time, SLA, volume and automation-rate metrics for the client's conversations in the window.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)

  return getSocialInboxAnalytics({ queryOne, queryRows }, { clientId, days })
})
