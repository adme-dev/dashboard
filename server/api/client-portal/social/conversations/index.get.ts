// server/api/client-portal/social/conversations/index.get.ts — session-scoped, read-only.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { listPortalConversations } from '~~/server/utils/socialInbox/portal'

/** GET /api/client-portal/social/conversations?channel=&platform=&status=&limit= */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event) as Record<string, string>
  return listPortalConversations({ queryRows, queryOne, execute }, client.clientId, {
    channel: q.channel, platform: q.platform, status: q.status, limit: q.limit,
  })
})
