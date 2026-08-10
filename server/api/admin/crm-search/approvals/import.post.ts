import { createError, eventHandler, readBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { verifyCrmSearchBootstrapApprovalEnvelope } from '~~/server/utils/crm/search/operations/bootstrapApproval'
import { importCrmSearchApprovalBootstrap, mapCrmSearchCommandError } from '~~/server/utils/crm/search/operations/commands'

const BodySchema = z.strictObject({
  version: z.literal('crm-search-bootstrap-approval-envelope-v1'),
  keyVersion: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/u),
  payload: z.record(z.string(), z.unknown()).refine(
    payload => payload.type === 'resource_provision',
    'resource_provision only'
  ),
  signature: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/u)
})

const VERIFICATION_BINDING = 'CRM_SEARCH_RESOURCE_APPROVAL_VERIFICATION_KEYRING'

function verificationKeyring(event: H3Event): unknown {
  return (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env?.[VERIFICATION_BINDING]
}

export function createCrmSearchApprovalImportHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<z.infer<typeof BodySchema>>
  verifyEnvelope(command: unknown, options: { keyring: unknown, nowMs: number }): Promise<unknown>
  importApproval(command: unknown, authority: Awaited<ReturnType<typeof requireFreshCrmSearchAdmin>>): Promise<unknown>
  now(): number
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    async readValidatedBody(event: H3Event) {
      const parsed = BodySchema.safeParse(await readBody(event))
      if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid approval import' })
      return parsed.data
    },
    verifyEnvelope: verifyCrmSearchBootstrapApprovalEnvelope,
    importApproval: importCrmSearchApprovalBootstrap,
    now: () => Date.now(),
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const body = await dependencies.readValidatedBody(event)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const verified = await dependencies.verifyEnvelope(body, {
        keyring: verificationKeyring(event),
        nowMs: dependencies.now()
      })
      const imported = await dependencies.importApproval(verified, authority)
      setResponseStatus(event, 201)
      return imported
    } catch (error) {
      const mapped = mapCrmSearchCommandError(error)
      throw createError({ statusCode: mapped.statusCode, statusMessage: mapped.statusMessage, data: { code: mapped.code } })
    }
  }
}

export default eventHandler(createCrmSearchApprovalImportHandler())
