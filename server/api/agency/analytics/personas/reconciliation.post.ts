import { z } from 'zod'
import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'
import { createIdentityResolutionCase } from '~~/server/utils/persona/reconciliation'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  caseType: z.enum(['conflict', 'merge', 'split', 'link_review']),
  primaryProfileId: z.string().uuid().optional(),
  secondaryProfileId: z.string().uuid().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  title: z.string().trim().min(3).max(160),
  reason: z.string().trim().min(3).max(2000),
  evidence: z.record(z.string(), z.unknown()).default({})
})

export default defineEventHandler(async event => {
  const user = await requirePersonaAdminAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  return createIdentityResolutionCase({ ...parsed.data, actorId: user.id })
})
