import { createError, eventHandler, getRouterParam, readBody, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { changeClientPolicy, mapCrmSearchCommandError } from '~~/server/utils/crm/search/operations/commands'

const BodySchema = z.strictObject({
  nextState: z.enum(['off', 'indexing', 'shadow', 'assist', 'teardown_pending']),
  expectedControlRevision: z.number().int().nonnegative(),
  expectedPolicyRevision: z.number().int().nonnegative(),
  approvalId: z.uuid().nullable().optional(),
  evaluationRunId: z.uuid().nullable().optional(),
  teardownCycleId: z.uuid().nullable().optional(),
  reason: z.string().trim().min(10).max(2_000),
  confirmation: z.string().min(1).max(120)
})

type Body = z.infer<typeof BodySchema>

async function defaultReadValidatedBody(event: H3Event): Promise<Body> {
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid CRM search command' })
  return parsed.data
}

function throwMapped(error: unknown): never {
  const mapped = mapCrmSearchCommandError(error)
  throw createError({
    statusCode: mapped.statusCode,
    statusMessage: mapped.statusMessage,
    data: { code: mapped.code, ...('action' in mapped ? { action: mapped.action } : {}) }
  })
}

export function createClientPolicyHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<Body>
  getClientId(event: H3Event): string | undefined
  setResponseHeader(event: H3Event, name: string, value: string): void
  transitionClientPolicy(command: Record<string, unknown>): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    readValidatedBody: defaultReadValidatedBody,
    getClientId: (event: H3Event) => getRouterParam(event, 'clientId'),
    setResponseHeader,
    transitionClientPolicy: async (command: Record<string, unknown>) => await changeClientPolicy(command, {
      actorId: String(command.actorId), orgId: String(command.orgId), permissions: ['ADMIN'],
      authorityRevision: String(command.authorityRevision)
    }),
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const clientId = dependencies.getClientId(event)
    if (!clientId || !z.uuid().safeParse(clientId).success) {
      throw createError({ statusCode: 404, statusMessage: 'CRM search policy not found' })
    }
    const body = await dependencies.readValidatedBody(event)
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.transitionClientPolicy({
        ...body,
        clientId,
        actorId: authority.actorId,
        orgId: authority.orgId,
        authorityRevision: authority.authorityRevision
      })
    } catch (error) {
      throwMapped(error)
    }
  }
}

export default eventHandler(createClientPolicyHandler())
