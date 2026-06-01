// server/api/client-portal/social/events.get.ts
// SSE stream of the client's OWN live inbox events. The room is keyed by the SESSION clientId
// (from requireClientAuth), never a request param — a portal user can never stream another tenant.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { streamInboxEvents } from '~~/server/utils/socialInbox/events'

/** GET /api/client-portal/social/events?lastEventId= */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const lastEventId = Number(getQuery(event).lastEventId) || 0
  return streamInboxEvents(event, client.clientId, lastEventId)
})
