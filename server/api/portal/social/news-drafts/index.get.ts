import { queryRows, transaction } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listPortalSocialNewsDrafts } from '~~/server/utils/socialNewsPortal'
import { isUUID } from '~~/server/utils/ids'

/** GET /api/portal/social/news-drafts — session-scoped news-backed approval drafts. */
export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)
  const limit = Number(query.limit)
  const postId = typeof query.postId === 'string' ? query.postId : undefined
  if (postId && !isUUID(postId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid news draft ID' })
  }

  return listPortalSocialNewsDrafts(
    { queryRows, transaction },
    clientUser.clientId,
    {
      status: typeof query.status === 'string' ? query.status : undefined,
      postId,
      limit: Number.isFinite(limit) ? limit : undefined
    }
  )
})
