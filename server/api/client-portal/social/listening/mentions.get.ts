import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { portalListMentions } from '~~/server/utils/socialListening/portal'

/** GET /api/client-portal/social/listening/mentions — session-scoped mentions. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event)
  return portalListMentions({ queryRows }, client.clientId, {
    limit: Number(q.limit) || 100,
    source: q.source ? String(q.source) : undefined,
    sentiment: q.sentiment ? String(q.sentiment) : undefined,
  })
})
