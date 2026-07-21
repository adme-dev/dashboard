import { createError, eventHandler, getRouterParam, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import {
  CatalogPilotMembershipError,
  enrollCatalogPilotMember,
  type CatalogPilotMembership,
  type CatalogPilotMembershipMutationInput
} from '~~/server/utils/ai/governance/catalogPilotMembership'

const ReleaseIdSchema = z.uuid()
const BodySchema = z.object({
  kind: z.enum(['pack', 'capability']),
  memberUserId: z.uuid(),
  reason: z.string().trim().min(1).max(2_000)
}).strict()

interface Dependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  getRouterParam(event: H3Event, name: string): string | undefined
  readBody(event: H3Event): Promise<unknown>
  enrollMember(input: CatalogPilotMembershipMutationInput): Promise<{
    created: boolean
    membership: CatalogPilotMembership
  }>
}

const defaults: Dependencies = {
  requirePermission,
  requireWriteAccess,
  getRouterParam,
  readBody,
  enrollMember: enrollCatalogPilotMember
}

export function createCatalogPilotMembershipPostHandler(dependencies: Dependencies = defaults) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const writableActor = await dependencies.requireWriteAccess(event)
    if (actor.id !== writableActor.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    }
    const releaseId = ReleaseIdSchema.safeParse(dependencies.getRouterParam(event, 'id'))
    const body = BodySchema.safeParse(await dependencies.readBody(event))
    if (!releaseId.success || !body.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid pilot membership request',
        data: { code: 'invalid_request' }
      })
    }
    try {
      return await dependencies.enrollMember({
        ...body.data,
        releaseId: releaseId.data,
        actorUserId: actor.id
      })
    } catch (error) {
      if (error instanceof CatalogPilotMembershipError) {
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

export default eventHandler(createCatalogPilotMembershipPostHandler())
