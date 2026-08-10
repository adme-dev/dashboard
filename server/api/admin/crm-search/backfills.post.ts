import { createError, eventHandler, readBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import {
  createDurableCrmSearchRequest,
  mapCrmSearchCommandError,
  scheduleCrmSearchBackfillCommand
} from '~~/server/utils/crm/search/operations/commands'

const BodySchema = z.strictObject({
  clientId: z.uuid(),
  candidateSchemaVersion: z.string().regex(/^crm-search-v[1-9][0-9]*$/u),
  expectedPolicyRevision: z.number().int().nonnegative(),
  approvalId: z.uuid(),
  limit: z.number().int().min(1).max(100),
  reason: z.string().trim().min(10).max(2_000),
  confirmation: z.literal('SCHEDULE CRM SEARCH BACKFILL')
})

export function createCrmSearchBackfillHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<z.infer<typeof BodySchema>>
  createDurableOperation(command: Record<string, unknown>): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    async readValidatedBody(event: H3Event) {
      const parsed = BodySchema.safeParse(await readBody(event))
      if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid CRM search backfill request' })
      return parsed.data
    },
    createDurableOperation: createDurableCrmSearchRequest,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const body = await dependencies.readValidatedBody(event)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const pending = await scheduleCrmSearchBackfillCommand({
        ...body, actor: authority, createDurableOperation: dependencies.createDurableOperation
      })
      setResponseStatus(event, 202)
      return pending as { operationId: string, status: 'pending' }
    } catch (error) {
      const mapped = mapCrmSearchCommandError(error)
      throw createError({ statusCode: mapped.statusCode, statusMessage: mapped.statusMessage, data: { code: mapped.code } })
    }
  }
}

export default eventHandler(createCrmSearchBackfillHandler())
