import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildSocialInboxWallQuery } from '~~/server/utils/socialInbox/wall'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const { sql, params } = buildSocialInboxWallQuery({
    clientId,
    platform: q.platform as string | undefined,
    accountId: q.accountId as string | undefined,
    status: q.status as string | undefined,
    assignedTo: q.assignedTo as string | undefined,
    search: q.q as string | undefined,
    limit: Number(q.limit) || undefined
  })

  return await queryRows(sql, params)
})
