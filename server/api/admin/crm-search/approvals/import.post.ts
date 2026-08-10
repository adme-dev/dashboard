import { createError, eventHandler, readBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { importCrmSearchApprovalBootstrap, mapCrmSearchCommandError } from '~~/server/utils/crm/search/operations/commands'

const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const BodySchema = z.strictObject({
  approvalType: z.literal('resource_provision'),
  environment: z.enum(['preview', 'production']),
  implementationGitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  artifactManifestDigest: digest,
  bindingManifestDigest: digest,
  evidenceBundleHash: digest,
  maximumCostUsdMicros: z.number().int().nonnegative(),
  approvedBy: z.uuid(),
  requestedByActorId: z.uuid(),
  reason: z.string().trim().min(10).max(2_000),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  importedProvenanceHash: digest
})

export function createCrmSearchApprovalImportHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<z.infer<typeof BodySchema>>
  importApproval(command: unknown, authority: Awaited<ReturnType<typeof requireFreshCrmSearchAdmin>>): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    async readValidatedBody(event: H3Event) {
      const parsed = BodySchema.safeParse(await readBody(event))
      if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid approval import' })
      return parsed.data
    },
    importApproval: importCrmSearchApprovalBootstrap,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const body = await dependencies.readValidatedBody(event)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const imported = await dependencies.importApproval(body, authority)
      setResponseStatus(event, 201)
      return imported
    } catch (error) {
      const mapped = mapCrmSearchCommandError(error)
      throw createError({ statusCode: mapped.statusCode, statusMessage: mapped.statusMessage, data: { code: mapped.code } })
    }
  }
}

export default eventHandler(createCrmSearchApprovalImportHandler())
