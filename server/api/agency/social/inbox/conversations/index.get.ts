import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildSocialInboxConversationListQuery } from '~~/server/utils/socialInbox/conversationList'

/**
 * GET /api/agency/social/inbox/conversations?clientId=&channel=&platform=&status=&limit=
 * List engagement conversations from active connected accounts, newest activity first.
 * Omit clientId for the agency-wide inbox; provide it to drill down to one client.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = typeof q.clientId === 'string' && q.clientId.trim() ? q.clientId : null

  const { sql, params } = buildSocialInboxConversationListQuery({
    clientId,
    channel: q.channel as string | undefined,
    platform: q.platform as string | undefined,
    status: q.status as string | undefined,
    assignedTo: q.assignedTo as string | undefined,
    unassigned: q.unassigned === 'true',
    breached: q.breached === 'true',
    search: q.search as string | undefined,
    limit: Number(q.limit) || undefined,
    offset: Number(q.offset) || undefined
  })
  return await queryRows(sql, params)
})
