import { z } from 'zod'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { ManagedTransferAuthorityInputSchema } from '~~/server/utils/pageStudio/managedTransferAuthority'
import { reviewManagedTransferSource, reserveManagedTransferIntent } from '~~/server/utils/pageStudio/managedTransferIntent'
import { coordinateManagedTransferResources } from '~~/server/utils/pageStudio/managedTransferResources'
import { coordinateManagedTransferExecution } from '~~/server/utils/pageStudio/managedTransferExecution'
import { coordinateManagedTransferSourceDrafts } from '~~/server/utils/pageStudio/managedTransferSourceDrafts'
import { coordinateManagedTransferDestinationExecution } from '~~/server/utils/pageStudio/managedTransferDestinationExecutionCoordinator'
import { coordinateManagedTransferDestinationCatalogue } from '~~/server/utils/pageStudio/managedTransferDestinationCatalogueCoordinator'
import { coordinateManagedTransferFormsHistory } from '~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const reference = { operationId: z.string().uuid(), intentDigest: digest }
const environment = { expectedEnvironment: z.literal('production') }
const action = z.enum(['status', 'start', 'resume', 'verify'])
const Request = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('review'), authority: ManagedTransferAuthorityInputSchema, ...environment }).strict(),
  z.object({ phase: z.literal('reserve'), operationId: reference.operationId, authority: ManagedTransferAuthorityInputSchema, expectedSourceDigest: digest, ...environment }).strict(),
  z.object({ phase: z.literal('resources'), ...reference, action, ...environment }).strict(),
  z.object({ phase: z.literal('source-execution'), ...reference, action, ...environment }).strict(),
  z.object({ phase: z.literal('source-drafts'), ...reference, action: z.enum(['status', 'start', 'resume']), ...environment }).strict(),
  z.object({ phase: z.literal('destination-execution'), ...reference, action, ...environment }).strict(),
  z.object({ phase: z.literal('destination-catalogue'), ...reference, action, ...environment }).strict(),
  z.object({ phase: z.literal('forms-history'), ...reference, action, ...environment }).strict()
])
const progress = <T extends [string, ...string[]]>(states: T) => z.object({ operationId: reference.operationId, state: z.enum(states) }).strict()
const Results = {
  'review': z.object({ sourceDigest: digest, checkpointId: z.string().min(1).max(128), applicationId: z.string().uuid(), objectCount: z.number().int().min(0).max(1000) }).strict(),
  'reserve': z.object({ operationId: reference.operationId, state: z.literal('reserved'), sourceDigest: digest, intentDigest: digest, destinationGeneration: z.string().uuid() }).strict(),
  'resources': progress(['not-started', 'preparing', 'resume-required', 'disabled', 'prepared', 'resources-bound']),
  'source-execution': progress(['not-started', 'resume-required', 'pending', 'ready', 'disabled']),
  'source-drafts': progress(['not-started', 'not-frozen', 'frozen']),
  'destination-execution': progress(['not-started', 'resume-required', 'pending', 'upload-uncertain', 'disabled', 'ready', 'execution-verified']),
  'destination-catalogue': progress(['not-started', 'resume-required', 'disabled', 'ready', 'catalogue-verified']),
  'forms-history': z.union([progress(['not-started', 'resume-required', 'pending', 'ready']),
    z.object({ operationId: reference.operationId, state: z.literal('verified'), receiptDigest: digest }).strict()])
}
const methods = ['readManagedTransferResources', 'inspectManagedTransferResources', 'prepareManagedTransferResources',
  'discoverManagedTransferExecution', 'readManagedTransferExecution', 'inspectManagedTransferExecution', 'prepareManagedTransferExecution',
  'readManagedTransferSourceDraftsFence', 'readManagedTransferSourceDraftsHistory', 'freezeManagedTransferSourceDrafts',
  'readManagedTransferDestinationExecution', 'prepareManagedTransferDestinationExecution', 'inspectManagedTransferDestinationExecution',
  'readManagedTransferDestinationCatalogue', 'prepareManagedTransferDestinationCatalogue', 'inspectManagedTransferDestinationCatalogue',
  'readManagedTransferFormsHistory', 'prepareManagedTransferFormsHistory', 'inspectManagedTransferFormsHistory']
type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: statusCode === 403 ? 'Transfer preparation access denied.' : 'Transfer preparation is unavailable. Check its saved status before retrying.' } })

/** Private service-binding transport. Every phase rechecks original native
 * authority; status never advances a phase, and uncertain calls are not retried. */
export async function handleManagedTransferPreparation(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = Request.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data)
  // Detach request/config and capture receivers before the first await.
  const storage = {
    PAGE_STUDIO_RELEASE_ENVIRONMENT: env.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    PAGE_STUDIO_PROVISIONING_ENVIRONMENT: env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT,
    MANAGED_TRANSFER_EXECUTION_POLICY: env.MANAGED_TRANSFER_EXECUTION_POLICY,
    MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY,
    PAGE_STUDIO_PROVISIONER: Object.fromEntries(methods.map(name => [name, capturePageStudioRpcMethod(env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined, name)]))
  }
  const artifacts = { policyVersion: 'content-attachment-v1', runtimeDigest: env.PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST,
    schemaDigest: env.PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST }
  const accountId = env.PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID
  const requestDigest = await collectionDigest(request)
  if (storage.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || storage.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, async () => {
      const dependencies = { env: storage, runTransaction: transactionWithoutRetry }
      if (request.phase === 'review') return reviewManagedTransferSource(request.authority, dependencies)
      if (request.phase === 'reserve') return reserveManagedTransferIntent({ operationId: request.operationId, authority: request.authority, expectedSourceDigest: request.expectedSourceDigest }, dependencies)
      const input = { operationId: request.operationId, intentDigest: request.intentDigest, action: request.action }
      switch (request.phase) {
        case 'resources': {
          const policy = JSON.parse(String(storage.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY))
          return coordinateManagedTransferResources(input, { ...dependencies, artifacts, provider: { accountId, compatibilityDate: policy.from.compatibilityDate } })
        }
        case 'source-execution': return coordinateManagedTransferExecution(input, dependencies)
        case 'source-drafts': return coordinateManagedTransferSourceDrafts(input, dependencies)
        case 'destination-execution': return coordinateManagedTransferDestinationExecution(input, dependencies)
        case 'destination-catalogue': return coordinateManagedTransferDestinationCatalogue(input, dependencies)
        case 'forms-history': return coordinateManagedTransferFormsHistory(input, dependencies)
      }
    })
    const checked = Results[request.phase].parse(value)
    if (request.phase !== 'review' && (!('operationId' in checked) || checked.operationId !== request.operationId)) return rejected(requestDigest)
    if (request.phase === 'reserve' && (!('sourceDigest' in checked) || checked.sourceDigest !== request.expectedSourceDigest)) return rejected(requestDigest)
    return { ok: true as const, requestDigest, phase: request.phase, value: checked }
  } catch (error) {
    const code = (error as { statusCode?: number })?.statusCode
    return rejected(requestDigest, code && [400, 401, 403, 409, 413].includes(code) ? code : 503)
  }
}
