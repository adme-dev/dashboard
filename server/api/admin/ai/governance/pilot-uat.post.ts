import { createError, eventHandler, readBody, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import { PilotEvidenceError, runControlledPilotUat } from '~~/server/utils/ai/governance/pilotEvidence'

const BodySchema = z.strictObject({
  requestId: z.uuid(), releaseId: z.uuid(), evaluationCaseId: z.uuid(),
  actorUserId: z.uuid(), conversationId: z.uuid()
})

interface Dependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  harnessEnabled(event: H3Event): boolean
  runUat(input: any, event: H3Event): Promise<any>
}

const defaults: Dependencies = {
  requirePermission, requireWriteAccess, readBody, setResponseHeader,
  harnessEnabled: event => (useRuntimeConfig(event) as any).aiPilotUatEnabled === true,
  runUat: runControlledPilotUat
}

export function createPilotUatPostHandler(dependencies: Dependencies = defaults) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const writable = await dependencies.requireWriteAccess(event)
    if (actor.id !== writable.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    if (!dependencies.harnessEnabled(event)) throw createError({ statusCode: 503, statusMessage: 'Pilot UAT harness unavailable', data: { code: 'representative_evidence_caller_unavailable' } })
    const body = BodySchema.safeParse(await dependencies.readBody(event))
    if (!body.success) throw createError({ statusCode: 422, statusMessage: 'Invalid pilot UAT request', data: { code: 'invalid_request' } })
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.runUat({ ...body.data, issuerUserId: actor.id, reason: 'Controlled pilot UAT harness' }, event)
    } catch (error) {
      if (error instanceof PilotEvidenceError) throw createError({ statusCode: error.statusCode, statusMessage: 'Pilot UAT was not admitted', data: { code: error.code } })
      throw createError({ statusCode: 500, statusMessage: 'Pilot UAT failed', data: { code: 'pilot_uat_failed' } })
    }
  }
}

export default eventHandler(createPilotUatPostHandler())
