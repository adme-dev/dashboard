import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { readLiveFacebook } from '~~/server/utils/socialPublishing/liveOperations'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const post = await requireSocialPostClientAccess(event, getRouterParam(event, 'id') || '')
  const account = z.string().uuid().safeParse(getQuery(event).accountId)
  if (!account.success) throw createError({ statusCode: 400, statusMessage: 'Valid account required' })
  return readLiveFacebook(post.id, post.client_id, account.data)
})
