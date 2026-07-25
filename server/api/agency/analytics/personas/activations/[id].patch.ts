import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transitionPersonaActivationRequest } from '~~/server/utils/persona/activation'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  action: z.enum(['approve_privacy', 'approve_live', 'reject', 'cancel']),
  reason: z.string().trim().min(3).max(1000)
})

export default defineEventHandler(async event => {
  const user = await requireAuth(event)
  if (!['owner', 'admin'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner or admin access required' })
  }
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  return transitionPersonaActivationRequest({
    ...parsed.data,
    requestId: getRouterParam(event, 'id') as string,
    actorId: user.id
  })
})
