import { createError } from 'h3'
import { z } from 'zod'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferWorkflowRequestSchema, TransferWorkflowPhases, TransferWorkflowViewSchema,
  TransferPhaseViewSchema, type TransferPhaseView } from '~~/shared/pageStudio/transferWorkflow'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { ManagedTransferCopyManagementResultSchema } from '~~/shared/pageStudio/managed-transfer-copy-management'
import { ManagedTransferCopyExecutionManagementResultSchema } from '~~/shared/pageStudio/managed-transfer-copy-execution-management'
import { requireManagedTransferCompletionReceipt } from '~~/shared/pageStudio/managed-transfer-completion'
import { withManagedTransferIntentAuthority, withReservedManagedTransfer } from '~~/server/utils/pageStudio/managedTransferIntent'
import { retainedManagedTransferFormsHistoryVerification } from '~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator'
import { readVerifiedCopyGraph } from './managedTransferCopyCoordinator'
import { retainedManagedTransferCompletion } from '~~/server/utils/pageStudio/managedTransferCompletionRead'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import { handleManagedTransferPreparation, ManagedTransferPreparationResults } from './managedTransferPreparation'
import { handleManagedTransferCopyManagement } from './managedTransferCopyManagement'
import { handleManagedTransferCopyExecutionManagement } from './managedTransferCopyExecutionManagement'
import { handleManagedTransferFinalization } from './completedManagedTransferManagement'
import { withReservedTransferControl } from './transferControls'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
type Phase = TransferPhaseView['phase']
type Reference = { operationId: string, intentDigest: string }
const fail = (statusCode = 503) => createError({ statusCode, statusMessage: 'Refresh the saved transfer status before continuing.' })
const ErrorResponse = z.object({ ok: z.literal(false), requestDigest: z.string(), error: z.object({ statusCode: z.number().int(), message: z.string() }).strict() }).strict()
const CompleteResponse = z.object({ ok: z.literal(true), requestDigest: z.string(), value: z.unknown() }).strict()
/** Capture fixed bindings before any await; no request-selected method dispatch. */
function configuration(env: Record<string, unknown>): Record<string, unknown> {
  const capture = (service: unknown, names: string[]) => Object.fromEntries(names.map(name => [name, capturePageStudioRpcMethod(service as Record<string, unknown> | undefined, name)]))
  return { ...env, PAGE_STUDIO_PROVISIONER: capture(env.PAGE_STUDIO_PROVISIONER, [
    'readManagedTransferResources', 'inspectManagedTransferResources', 'prepareManagedTransferResources',
    'discoverManagedTransferExecution', 'readManagedTransferExecution', 'inspectManagedTransferExecution', 'prepareManagedTransferExecution',
    'readManagedTransferSourceDraftsFence', 'readManagedTransferSourceDraftsHistory', 'freezeManagedTransferSourceDrafts',
    'readManagedTransferDestinationExecution', 'prepareManagedTransferDestinationExecution', 'inspectManagedTransferDestinationExecution',
    'readManagedTransferDestinationCatalogue', 'prepareManagedTransferDestinationCatalogue', 'inspectManagedTransferDestinationCatalogue',
    'readManagedTransferFormsHistory', 'prepareManagedTransferFormsHistory', 'inspectManagedTransferFormsHistory',
    'readManagedTransferCopyGraph', 'prepareManagedTransferCopyGraph', 'inspectManagedTransferCopyGraph',
    'readManagedTransferDestinationAuthoring', 'installManagedTransferDestinationAuthoring', 'readManagedTransferSourceRetention', 'retainManagedTransferSourceDrafts'
  ]), PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: capture(env.PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER, ['readManagedCmsTarget', 'readManagedCmsObjectsAtTarget', 'fetch']),
  PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: capture(env.PAGE_STUDIO_CMS_STAGING_CHECKPOINTS, ['get']) }
}
function projection(phase: Phase, state: TransferPhaseView['state']): TransferPhaseView {
  let allowedActions: TransferPhaseView['allowedActions'] = []
  if (!['unavailable', 'disabled', 'completed', 'resources-bound', 'frozen', 'copy-admitted', 'verified', 'catalogue-verified', 'execution-verified'].includes(state)) {
    if (phase === 'completion') allowedActions = ['complete']
    else if (phase === 'copy-admission') allowedActions = ['prepare']
    else if (state === 'not-started') allowedActions = ['start']
    else if (phase === 'source-drafts') allowedActions = ['resume']
    else if (['ready', 'prepared'].includes(state)) allowedActions = ['verify']
    else allowedActions = ['resume', 'verify']
  }
  return TransferPhaseViewSchema.parse({ phase, state, allowedActions })
}
async function checked<T>(raw: unknown, request: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = structuredClone(raw)
  const digest = await collectionDigest(request)
  const rejected = ErrorResponse.safeParse(response)
  if (rejected.success) {
    if (rejected.data.requestDigest !== digest) throw fail()
    throw fail([400, 401, 403, 409, 413].includes(rejected.data.error.statusCode) ? rejected.data.error.statusCode : 503)
  }
  const result = schema.safeParse(response)
  if (!result.success || (result.data as { requestDigest?: string }).requestDigest !== digest) throw fail()
  return result.data
}
async function phaseCall(phase: Phase, action: string, reference: Reference, env: Record<string, unknown>, run: Runner): Promise<TransferPhaseView> {
  if (phase === 'completion') {
    if (action === 'status') {
      const receipt = await runCmsDatabaseInvocation(run, () => withManagedTransferIntentAuthority(reference, retainedManagedTransferCompletion, { runTransaction: transactionWithoutRetry }))
      if (receipt) {
        if (receipt.operationId !== reference.operationId || receipt.intentDigest !== reference.intentDigest) throw fail()
        return projection(phase, 'completed')
      }
      // Offer the terminal action only when both retained verifications validate.
      // The finalizer still performs independent physical inspections on POST.
      const ready = await runCmsDatabaseInvocation(run, () => withReservedManagedTransfer(reference, async (db, intent) =>
        Boolean(await readVerifiedCopyGraph(db, intent, env) && await retainedManagedTransferFormsHistoryVerification(db, intent, env)),
      { runTransaction: transactionWithoutRetry }))
      return { ...projection(phase, 'not-started'), allowedActions: ready ? ['complete'] : [] }
    }
    const response = await checked(await handleManagedTransferFinalization(reference, env, run), reference, CompleteResponse)
    const receipt = await requireManagedTransferCompletionReceipt(response.value)
    if (receipt.operationId !== reference.operationId || receipt.intentDigest !== reference.intentDigest) throw fail()
    return projection(phase, 'completed')
  }
  const request = { ...reference, action: phase === 'copy-admission' && action === 'status' ? 'read' : action, expectedEnvironment: 'production' as const }
  let value: { operationId: string, state: string }
  if (phase === 'copy-admission') {
    const result = await checked(await handleManagedTransferCopyManagement(request, env, run), request, ManagedTransferCopyManagementResultSchema)
    if (!result.ok) throw fail()
    value = result.value
  } else if (phase === 'copy-execution') {
    const result = await checked(await handleManagedTransferCopyExecutionManagement(request, env, run), request, ManagedTransferCopyExecutionManagementResultSchema)
    if (!result.ok || !('state' in result.value)) throw fail()
    value = result.value
  } else {
    const input = { ...request, phase }
    const schema = z.object({ ok: z.literal(true), requestDigest: z.string(), phase: z.literal(phase), value: ManagedTransferPreparationResults[phase] }).strict()
    const result = await checked(await handleManagedTransferPreparation(input, env, run), input, schema)
    value = result.value
  }
  if (value.operationId !== reference.operationId) throw fail()
  return projection(phase, TransferPhaseViewSchema.shape.state.parse(value.state))
}
/** One explicit mutation, never a phase loop on POST. GET loops over reads only.
 * Existing engines enforce all prerequisites and source/plan/session checks;
 * readiness is not relabelled as persisted verification on subsequent reads. */
export async function handleTransferWorkflow(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = TransferWorkflowRequestSchema.safeParse(raw)
  const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
    error: { statusCode, message: 'Transfer status could not be confirmed. Refresh the saved request before continuing.' } })
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data), storage = configuration(env)
  const requestDigest = await collectionDigest(request)
  if (storage.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || storage.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, () => withReservedTransferControl({ siteId: request.siteId, requestId: request.requestId,
      expectedRevision: request.expectedRevision, operator: request.operator }, async (reference) => {
      const phases: TransferPhaseView[] = []
      if (request.action === 'status') {
        for (const phase of TransferWorkflowPhases) {
          try {
            phases.push(await phaseCall(phase, 'status', reference, storage, run))
          } catch {
            phases.push(projection(phase, 'unavailable'))
          }
        }
      } else phases.push(await phaseCall(request.phase, request.action, reference, storage, run))
      return TransferWorkflowViewSchema.parse({ siteId: request.siteId, requestId: request.requestId, revision: request.expectedRevision, phases })
    }, { runTransaction: transactionWithoutRetry }))
    return { ok: true as const, requestDigest, value }
  } catch (error) {
    const code = (error as { statusCode?: number })?.statusCode
    return rejected(requestDigest, code && [400, 401, 403, 409, 413].includes(code) ? code : 503)
  }
}
