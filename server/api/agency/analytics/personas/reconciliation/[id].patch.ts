import { z } from 'zod'
import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'
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
  const user = await requirePersonaAdminAccess(event)
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
