import { createError, eventHandler, getRouterParam, readBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import {
  mapCrmSearchCommandError,
  recoverCrmSearchDeadLetterCommand,
  requestCrmSearchDeadLetterRecoveryRecord
} from '~~/server/utils/crm/search/operations/commands'

const BodySchema = z.strictObject({
  origin: z.enum(['cloudflare_transport', 'provider_confirmation']),
  action: z.enum(['transport_retry', 'confirmation_reconcile']),
  expectedRevision: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/u),
  expectedGeneration: z.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(2_000),
  confirmation: z.literal('RECOVER CRM SEARCH DEAD LETTER')
})
const originActions = {
  cloudflare_transport: 'transport_retry',
  provider_confirmation: 'confirmation_reconcile'
} as const
const mismatchCode = 'crm_search_dead_letter_action_mismatch'

export function createCrmSearchDeadLetterActionHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<z.infer<typeof BodySchema>>
  getId(event: H3Event): string | undefined
  requestDurableRecovery(command: Record<string, unknown>): Promise<unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  setResponseStatus(event: H3Event, status: number): void
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    async readValidatedBody(event: H3Event) {
      const parsed = BodySchema.safeParse(await readBody(event))
      if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid dead-letter action' })
      if (originActions[parsed.data.origin] !== parsed.data.action) {
        throw createError({ statusCode: 422, statusMessage: 'Invalid dead-letter action', data: { code: mismatchCode } })
      }
      return parsed.data
    },
    getId: (event: H3Event) => getRouterParam(event, 'id'),
    requestDurableRecovery: requestCrmSearchDeadLetterRecoveryRecord,
    setResponseHeader,
    setResponseStatus,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const deadLetterId = dependencies.getId(event)
    if (!deadLetterId || !z.uuid().safeParse(deadLetterId).success) {
      throw createError({ statusCode: 404, statusMessage: 'CRM search dead letter not found' })
    }
    const body = await dependencies.readValidatedBody(event)
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const pending = await recoverCrmSearchDeadLetterCommand({
        ...body, deadLetterId, actor: authority,
        requestDurableRecovery: dependencies.requestDurableRecovery
      })
      dependencies.setResponseStatus(event, 202)
      return pending
    } catch (error) {
      const mapped = mapCrmSearchCommandError(error)
      throw createError({
        statusCode: mapped.statusCode,
        statusMessage: mapped.statusMessage,
        data: { code: mapped.code, ...('action' in mapped ? { action: mapped.action } : {}) }
      })
    }
  }
}

export default eventHandler(createCrmSearchDeadLetterActionHandler())
