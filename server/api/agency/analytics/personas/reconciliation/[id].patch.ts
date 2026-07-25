import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transitionIdentityResolutionCase } from '~~/server/utils/persona/reconciliation'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  action: z.enum(['start_review', 'approve', 'reject', 'apply', 'rollback']),
  reason: z.string().trim().min(3).max(2000),
  mappings: z.array(z.strictObject({
    sourceProfileId: z.string().uuid(),
    resolvedProfileId: z.string().uuid(),
    subjectType: z.string().trim().min(1).max(80).optional(),
    subjectId: z.string().trim().min(1).max(512).optional()
  })).max(5000).optional()
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
  return transitionIdentityResolutionCase({
    ...parsed.data,
    caseId: getRouterParam(event, 'id') as string,
    actorId: user.id
  })
})
