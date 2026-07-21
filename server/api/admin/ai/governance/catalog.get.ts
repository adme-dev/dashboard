import { createError, eventHandler, getQuery, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  CatalogGovernanceReadError,
  listCatalogGovernance,
  type CatalogGovernanceListInput,
  type CatalogGovernanceItem
} from '~~/server/utils/ai/governance/catalogGovernanceRead'

const CatalogGovernanceQuerySchema = z.object({
  departmentId: z.uuid().optional(),
  kind: z.enum(['pack', 'capability']).optional(),
  releaseState: z.enum(['draft', 'pilot', 'active', 'suspended', 'retired']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional()
}).strict()

interface CatalogGovernanceGetDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  getQuery(event: H3Event): Record<string, unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  listCatalog(input: CatalogGovernanceListInput): Promise<{
    items: CatalogGovernanceItem[]
    nextCursor: string | null
  }>
}

const defaultDependencies: CatalogGovernanceGetDependencies = {
  requirePermission,
  getQuery,
  setResponseHeader,
  listCatalog: listCatalogGovernance
}

export function createCatalogGovernanceGetHandler(
  dependencies: CatalogGovernanceGetDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')

    const parsed = CatalogGovernanceQuerySchema.safeParse(dependencies.getQuery(event))
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid catalog governance query',
        data: { code: 'invalid_request' }
      })
    }

    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.listCatalog({
        departmentId: parsed.data.departmentId ?? null,
        kind: parsed.data.kind ?? null,
        releaseState: parsed.data.releaseState ?? null,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor ?? null
      })
    } catch (error) {
      if (error instanceof CatalogGovernanceReadError) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Invalid catalog governance query',
          data: { code: 'invalid_request' }
        })
      }
      throw error
    }
  }
}

export default eventHandler(createCatalogGovernanceGetHandler())
