import {
  createError,
  eventHandler,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  REQUIRED_DEPARTMENT_PACK_KEYS
} from '~~/server/utils/ai/governance/departmentPackBlueprints'
import {
  DepartmentDraftPackSeedError,
  seedDepartmentDraftPack,
  type DepartmentDraftPackSeedRequest,
  type DepartmentDraftPackSeedResult
} from '~~/server/utils/ai/governance/departmentDraftPackSeeder'
import { postgresDepartmentDraftPackSeedRepository } from '~~/server/utils/ai/governance/departmentDraftPackSeedPostgres'

const BodySchema = z.object({
  blueprintKey: z.enum(REQUIRED_DEPARTMENT_PACK_KEYS),
  departmentId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2_000),
  confirmation: z.literal('SEED_DRAFT')
}).strict()

interface DepartmentDraftPackSeedPostDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  setResponseStatus(event: H3Event, statusCode: number): void
  seedDraftPack(input: DepartmentDraftPackSeedRequest): Promise<DepartmentDraftPackSeedResult>
}

const defaultDependencies: DepartmentDraftPackSeedPostDependencies = {
  requirePermission,
  readBody,
  setResponseHeader,
  setResponseStatus,
  seedDraftPack: input => seedDepartmentDraftPack(input, postgresDepartmentDraftPackSeedRepository)
}

export function createDepartmentDraftPackSeedPostHandler(
  dependencies: DepartmentDraftPackSeedPostDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    const actor = await dependencies.requirePermission(event, 'ADMIN')
    const parsed = BodySchema.safeParse(await dependencies.readBody(event))
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid department draft-pack request',
        data: { code: 'invalid_request' }
      })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')

    try {
      const result = await dependencies.seedDraftPack({
        blueprintKey: parsed.data.blueprintKey,
        departmentId: parsed.data.departmentId,
        ownerUserId: parsed.data.ownerUserId,
        actorUserId: actor.id,
        reason: parsed.data.reason
      })
      dependencies.setResponseStatus(event, result.outcome === 'created' ? 201 : 200)
      return result
    } catch (error) {
      if (error instanceof DepartmentDraftPackSeedError) {
        const statusCode = [404, 409, 422].includes(error.statusCode) ? error.statusCode : 500
        throw createError({
          statusCode,
          statusMessage: 'Department draft pack could not be seeded',
          data: { code: statusCode === 500 ? 'seed_failed' : error.code }
        })
      }
      throw error
    }
  }
}

export default eventHandler(createDepartmentDraftPackSeedPostHandler())
