import { createError, eventHandler, getQuery, getRouterParam, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  CatalogPilotMembershipError,
  listCatalogPilotMembers,
  type CatalogPilotMembership,
  type CatalogPilotRelease
} from '~~/server/utils/ai/governance/catalogPilotMembership'

const ReleaseIdSchema = z.uuid()
const QuerySchema = z.object({ kind: z.enum(['pack', 'capability']) }).strict()

interface Dependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  getRouterParam(event: H3Event, name: string): string | undefined
  getQuery(event: H3Event): Record<string, unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  listMemberships(input: { kind: 'pack' | 'capability', releaseId: string }): Promise<{
    release: CatalogPilotRelease
    memberships: CatalogPilotMembership[]
  }>
}

const defaults: Dependencies = {
  requirePermission,
  getRouterParam,
  getQuery,
  setResponseHeader,
  listMemberships: listCatalogPilotMembers
}

export function createCatalogPilotMembershipGetHandler(dependencies: Dependencies = defaults) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')
    const releaseId = ReleaseIdSchema.safeParse(dependencies.getRouterParam(event, 'id'))
    const query = QuerySchema.safeParse(dependencies.getQuery(event))
    if (!releaseId.success || !query.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid pilot membership query',
        data: { code: 'invalid_request' }
      })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.listMemberships({
        kind: query.data.kind,
        releaseId: releaseId.data
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

export default eventHandler(createCatalogPilotMembershipGetHandler())
