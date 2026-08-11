import { createError, eventHandler, getRouterParam, readBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { mapCrmSearchCommandError, revokeCrmSearchApprovalRecord } from '~~/server/utils/crm/search/operations/commands'

const BodySchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(2_000),
  confirmation: z.literal('REVOKE CRM SEARCH APPROVAL')
})

export function createCrmSearchApprovalRevokeHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<z.infer<typeof BodySchema>>
  getId(event: H3Event): string | undefined
  revokeApproval(command: Record<string, unknown>, authority: Awaited<ReturnType<typeof requireFreshCrmSearchAdmin>>): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    async readValidatedBody(event: H3Event) {
      const parsed = BodySchema.safeParse(await readBody(event))
      if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid approval revocation' })
      return parsed.data
    },
    getId: (event: H3Event) => getRouterParam(event, 'id'),
    revokeApproval: revokeCrmSearchApprovalRecord,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const approvalId = dependencies.getId(event)
    if (!approvalId || !z.uuid().safeParse(approvalId).success) {
      throw createError({ statusCode: 404, statusMessage: 'CRM search approval not found' })
    }
    const body = await dependencies.readValidatedBody(event)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const revoked = await dependencies.revokeApproval({ ...body, approvalId }, authority)
      setResponseStatus(event, 202)
      return revoked
    } catch (error) {
      const mapped = mapCrmSearchCommandError(error)
      throw createError({ statusCode: mapped.statusCode, statusMessage: mapped.statusMessage, data: { code: mapped.code } })
    }
  }
}

export default eventHandler(createCrmSearchApprovalRevokeHandler())
