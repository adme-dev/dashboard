import { z } from 'zod'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { requestLiveReview } from '~~/server/utils/socialPublishing/liveReviews'
import { manageLiveFacebook } from '~~/server/utils/socialPublishing/liveOperations'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const post = await requireSocialPostClientAccess(event, getRouterParam(event, 'id') || '')
  const parsed = z.object({ operationId: z.string().uuid(), reviewRequestId: z.string().uuid().optional(), requestReview: z.boolean().optional(), accountId: z.string().uuid(),
    action: z.enum(['edit', 'remove', 'reconcile']), expectedMessage: z.string().max(10000).optional(),
    message: z.string().min(1).max(10000).optional(), confirmed: z.literal(true)
  }).strict().safeParse(await readBody(event))
  if (!parsed.success || (parsed.data.action !== 'reconcile' && parsed.data.expectedMessage === undefined)
    || (parsed.data.requestReview && (parsed.data.reviewRequestId || parsed.data.action === 'reconcile'))
    || (parsed.data.action === 'edit' && !parsed.data.message?.trim())) throw createError({ statusCode: 400, statusMessage: 'Review and confirm the current caption and action' })
  if (parsed.data.requestReview) return requestLiveReview(post.id, post.client_id, user.id, parsed.data)
  return manageLiveFacebook(post.id, post.client_id, user.id, parsed.data)
})
