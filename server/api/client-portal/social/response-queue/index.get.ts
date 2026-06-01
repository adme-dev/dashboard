// server/api/client-portal/social/response-queue/index.get.ts — pending client-approval drafts.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { listPortalApprovals } from '~~/server/utils/socialInbox/portal'

/** GET /api/client-portal/social/response-queue → drafts awaiting THIS client's approval. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  return listPortalApprovals({ queryRows, queryOne, execute }, client.clientId)
})
