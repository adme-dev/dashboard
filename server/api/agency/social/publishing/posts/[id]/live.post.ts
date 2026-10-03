import { z } from 'zod'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { manageLiveFacebook } from '~~/server/utils/socialPublishing/liveOperations'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const post = await requireSocialPostClientAccess(event, getRouterParam(event, 'id') || '')
  const parsed = z.object({ operationId: z.string().uuid(), accountId: z.string().uuid(),
    action: z.enum(['edit', 'remove', 'reconcile']), expectedMessage: z.string().max(10000).optional(),
    message: z.string().min(1).max(10000).optional(), confirmed: z.literal(true)
  }).strict().safeParse(await readBody(event))
  if (!parsed.success || (parsed.data.action !== 'reconcile' && parsed.data.expectedMessage === undefined)
    || (parsed.data.action === 'edit' && !parsed.data.message?.trim())) throw createError({ statusCode: 400, statusMessage: 'Review and confirm the current caption and action' })
  return manageLiveFacebook(post.id, post.client_id, user.id, parsed.data)
})
