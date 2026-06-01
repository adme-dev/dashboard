// server/api/client-portal/social/conversations/[id]/index.get.ts — session-scoped, read-only.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { getPortalConversation } from '~~/server/utils/socialInbox/portal'

/** GET /api/client-portal/social/conversations/:id → { conversation, messages } (internal notes excluded). */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const result = await getPortalConversation({ queryRows, queryOne, execute }, client.clientId, id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return result
})
