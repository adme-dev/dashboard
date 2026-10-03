import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { respondLiveReview } from '~~/server/utils/socialPublishing/liveReviews'

export default defineEventHandler(async (event) => {
  const user = await requireClientAuth(event)
  if (!user.permissions.canApproveWork) throw createError({ statusCode: 403, statusMessage: 'Approval access required' })
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const body = z.object({ action: z.enum(['approve', 'reject', 'request_changes']), feedback: z.string().max(4000).default('') }).strict().safeParse(await readBody(event))
  if (!id.success || !body.success) throw createError({ statusCode: 400, statusMessage: 'Valid review request and decision required' })
  return respondLiveReview(user.clientId, user.id, id.data, body.data.action, body.data.feedback)
})
