// server/api/agency/social/inbox/events.get.ts
// SSE stream of a client's live inbox events for agency staff. Agency staff manage ALL clients
// (the established all-clients workflow), so the client room is selected by the ?clientId param.
import { requireSocialInboxClient } from '~~/server/utils/socialInbox/departmentScope'
import { streamInboxEvents } from '~~/server/utils/socialInbox/events'

/** GET /api/agency/social/inbox/events?clientId=&lastEventId= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  // Department staff may only subscribe to an active client's room.
  await requireSocialInboxClient(event, clientId)
  const lastEventId = Number(q.lastEventId) || 0
  return streamInboxEvents(event, clientId, lastEventId)
})
