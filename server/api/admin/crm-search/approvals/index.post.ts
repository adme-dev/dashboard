import { createError, eventHandler, readBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { requireFreshCrmSearchAdmin } from '~~/server/utils/crm/search/operations/audit'
import { createCrmSearchApproval, mapCrmSearchCommandError } from '~~/server/utils/crm/search/operations/commands'
import { CRM_SEARCH_ORDINARY_CHANGE_APPROVAL_TYPES } from '~~/server/utils/crm/search/operations/contracts'

const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const count = z.number().int().nonnegative()
const BodySchema = z.strictObject({
  approvalType: z.enum(CRM_SEARCH_ORDINARY_CHANGE_APPROVAL_TYPES),
  environment: z.enum(['preview', 'production']),
  implementationGitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  artifactManifestDigest: digest,
  pagesBundleDigest: digest.optional(),
  workerBundleDigest: digest.optional(),
  bindingManifestDigest: digest,
  evidenceBundleHash: digest,
  loadProtocolDigest: digest.optional(),
  providerContractDigest: digest.optional(),
  rateCardId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  maximumCostUsdMicros: count,
  expectedControlRevision: count.optional(),
  expectedPolicyRevision: count.optional(),
  expectedDeploymentApprovalId: z.uuid().optional(),
  targetSchemaVersion: z.string().regex(/^crm-search-v[1-9][0-9]*$/u).optional(),
  requestedAction: z.enum([
    'enable_indexing', 'restore_indexing_readiness', 'policy_indexing',
    'configure_candidate', 'promote_candidate', 'retire_schema'
  ]).optional(),
  activeVectorCount: count.optional(), candidateVectorCount: count.optional(),
  retiringVectorCount: count.optional(), sentinelVectorCount: count.optional(),
  deletionPendingVectorCount: count.optional(), forecastVectorCount: count.optional(),
  vectorCapacity: count.positive().optional(), activeNamespaceCount: count.optional(),
  candidateNamespaceCount: count.optional(), retiringNamespaceCount: count.optional(),
  sentinelNamespaceCount: count.optional(), deletionPendingNamespaceCount: count.optional(),
  forecastNamespaceCount: count.optional(), namespaceCapacity: count.positive().optional(),
  requestedByActorId: z.uuid(),
  reason: z.string().trim().min(10).max(2_000),
  expiresAt: z.iso.datetime()
})

export function createCrmSearchApprovalPostHandler(overrides: Partial<{
  requireFreshAdmin(event: H3Event): ReturnType<typeof requireFreshCrmSearchAdmin>
  readValidatedBody(event: H3Event): Promise<z.infer<typeof BodySchema>>
  createApproval(command: unknown, authority: Awaited<ReturnType<typeof requireFreshCrmSearchAdmin>>): Promise<unknown>
}> = {}) {
  const dependencies = {
    requireFreshAdmin: (event: H3Event) => requireFreshCrmSearchAdmin(event),
    async readValidatedBody(event: H3Event) {
      const parsed = BodySchema.safeParse(await readBody(event))
      if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid CRM search approval' })
      return parsed.data
    },
    createApproval: createCrmSearchApproval,
    ...overrides
  }
  return async (event: H3Event) => {
    const authority = await dependencies.requireFreshAdmin(event)
    const body = await dependencies.readValidatedBody(event)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const created = await dependencies.createApproval(body, authority)
      setResponseStatus(event, 201)
      return created
    } catch (error) {
      const mapped = mapCrmSearchCommandError(error)
      throw createError({ statusCode: mapped.statusCode, statusMessage: mapped.statusMessage, data: { code: mapped.code } })
    }
  }
}

export default eventHandler(createCrmSearchApprovalPostHandler())
