import { createError, eventHandler, getRouterParam, readBody, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import { assessPilotUatEvidence, PilotEvidenceError } from '~~/server/utils/ai/governance/pilotEvidence'

const BodySchema = z.strictObject({
  reason: z.string().trim().min(10).max(2000),
  scopeRespected: z.boolean(), approvalBoundaryRespected: z.boolean(),
  prohibitedEffectObserved: z.boolean(), freshnessRespected: z.boolean(),
  fabricationObserved: z.boolean(), credentialLeakObserved: z.boolean()
})

interface Dependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  getRouterParam(event: H3Event, name: string): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  assess(input: any): Promise<any>
}

const defaults: Dependencies = { requirePermission, requireWriteAccess, readBody, getRouterParam, setResponseHeader, assess: assessPilotUatEvidence }

export function createPilotUatAssessmentPostHandler(dependencies: Dependencies = defaults) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const writable = await dependencies.requireWriteAccess(event)
    if (actor.id !== writable.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    const id = z.uuid().safeParse(dependencies.getRouterParam(event, 'id'))
    const body = BodySchema.safeParse(await dependencies.readBody(event))
    if (!id.success || !body.success) throw createError({ statusCode: 422, statusMessage: 'Invalid pilot assessment request', data: { code: 'invalid_request' } })
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.assess({ evidenceId: id.data, assessorUserId: actor.id, ...body.data })
    } catch (error) {
      if (error instanceof PilotEvidenceError) throw createError({ statusCode: error.statusCode, statusMessage: 'Pilot assessment was not admitted', data: { code: error.code } })
      throw createError({ statusCode: 500, statusMessage: 'Pilot assessment failed', data: { code: 'pilot_assessment_failed' } })
    }
  }
}

export default eventHandler(createPilotUatAssessmentPostHandler())
