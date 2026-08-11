import { createError, eventHandler, readBody, setResponseHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { changeGlobalControl, mapCrmSearchCommandError } from '~~/server/utils/crm/search/operations/commands'

const BodySchema = z.strictObject({
  nextState: z.enum(['halted', 'delete_only', 'enabled']),
  nextMaximumMode: z.enum(['off', 'shadow', 'assist']).optional(),
  indexingReady: z.boolean().optional(),
  expectedRevision: z.number().int().nonnegative(),
  approvalId: z.uuid().nullable().optional(),
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

export function createGlobalControlHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<Body>
  setResponseHeader(event: H3Event, name: string, value: string): void
  transitionGlobalControl(command: Record<string, unknown>): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    readValidatedBody: defaultReadValidatedBody,
    setResponseHeader,
    transitionGlobalControl: async (command: Record<string, unknown>) => await changeGlobalControl(command, {
      actorId: String(command.actorId), orgId: String(command.orgId), permissions: ['ADMIN'],
      authorityRevision: String(command.authorityRevision)
    }),
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const body = await dependencies.readValidatedBody(event)
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return await dependencies.transitionGlobalControl({
        ...body,
        actorId: authority.actorId,
        orgId: authority.orgId,
        authorityRevision: authority.authorityRevision
      })
    } catch (error) {
      throwMapped(error)
    }
  }
}

export default eventHandler(createGlobalControlHandler())
