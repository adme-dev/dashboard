import { createError, eventHandler, getRouterParam, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import {
  CatalogGovernanceError,
  transitionCatalogRelease,
  type CatalogReleaseRecord,
  type CatalogReleaseTransitionRequest
} from '~~/server/utils/ai/governance/catalogReleaseGovernance'

const ReleaseIdSchema = z.uuid()

const ReleaseTransitionBodySchema = z.object({
  kind: z.enum(['pack', 'capability']),
  targetState: z.enum(['pilot', 'active', 'suspended', 'retired']),
  evaluationRunId: z.uuid().nullable().optional().transform(value => value ?? null),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2_000)
}).strict()

interface CatalogReleasePatchDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  getRouterParam(event: H3Event, name: string): string | undefined
  transitionRelease(request: CatalogReleaseTransitionRequest): Promise<CatalogReleaseRecord>
}

const defaultDependencies: CatalogReleasePatchDependencies = {
  requirePermission,
  requireWriteAccess,
  readBody,
  getRouterParam,
  transitionRelease: transitionCatalogRelease
}

export function createCatalogReleasePatchHandler(
  dependencies: CatalogReleasePatchDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const writableActor = await dependencies.requireWriteAccess(event)
    if (actor.id !== writableActor.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    }

    const parsedId = ReleaseIdSchema.safeParse(dependencies.getRouterParam(event, 'id'))
    const parsedBody = ReleaseTransitionBodySchema.safeParse(await dependencies.readBody(event))
    if (!parsedId.success || !parsedBody.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid catalog release transition request',
        data: { code: 'invalid_request' }
      })
    }

    try {
      const release = await dependencies.transitionRelease({
        ...parsedBody.data,
        releaseId: parsedId.data,
        actorUserId: actor.id
      })
      return { release }
    } catch (error) {
      if (error instanceof CatalogGovernanceError) {
        throw createError({
          statusCode: error.statusCode,
          statusMessage: error.message,
          data: { code: error.code }
        })
      }
      throw error
    }
  }
}

export default eventHandler(createCatalogReleasePatchHandler())
