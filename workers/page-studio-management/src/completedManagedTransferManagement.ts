import { CompletedManagedTransferManagementRequestSchema as Request, CompletedManagedTransferManagementResultSchema as Result } from '~~/shared/pageStudio/completed-managed-transfer-management'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import { ManagedTransferReferenceSchema as Reference } from '~~/server/utils/pageStudio/managedTransferIntent'
import { requireManagedTransferCompletionReceipt } from '~~/shared/pageStudio/managed-transfer-completion'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import { coordinateCompletedManagedTransfer } from './completedManagedTransfer'
import { completeManagedTransfer } from './managedTransferCompletion'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

type Runner = <T>(work: (db: PageStudioQueryClient) => Promise<T>) => Promise<T>
const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: statusCode === 403 ? 'Completed transfer access denied.' : 'Completed transfer management is unavailable.' } })
const statusCode = (error: unknown) => {
  const status = (error as { statusCode?: number })?.statusCode
  return status && [400, 401, 403, 409, 413].includes(status) ? status : 503
}
/** Snapshot only fixed trusted bindings/configuration before the first await. */
function storage(env: Record<string, unknown>) {
  const service = env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const names = ['readManagedTransferDestinationAuthoring', 'installManagedTransferDestinationAuthoring',
    'readManagedTransferSourceRetention', 'retainManagedTransferSourceDrafts',
    'inspectManagedTransferCopyGraph', 'inspectManagedTransferFormsHistory']
  return { PAGE_STUDIO_RELEASE_ENVIRONMENT: env.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    PAGE_STUDIO_PROVISIONING_ENVIRONMENT: env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT,
    MANAGED_TRANSFER_EXECUTION_POLICY: env.MANAGED_TRANSFER_EXECUTION_POLICY,
    MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY,
    PAGE_STUDIO_PROVISIONER: Object.fromEntries(names.map(name => [name, capturePageStudioRpcMethod(service, name)])) }
}
/** Customer-safe actions cannot invoke the original finalizer. */
export async function handleCompletedManagedTransferManagement(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = Request.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data), trusted = storage(env)
  const requestDigest = await collectionDigest(request)
  if (trusted.PAGE_STUDIO_RELEASE_ENVIRONMENT !== request.expectedEnvironment || trusted.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, () => coordinateCompletedManagedTransfer({ siteId: request.siteId, action: request.action }, { env: trusted, runTransaction: transactionWithoutRetry }))
    return Result.parse({ ok: true, requestDigest, value })
  } catch (error) {
    return rejected(requestDigest, statusCode(error))
  }
}
/** Reference-only private RPC. It retains the original principal checks and
 * fresh physical inspections in completeManagedTransfer; no browser route. */
export async function handleManagedTransferFinalization(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = Reference.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const reference = structuredClone(parsed.data), trusted = storage(env)
  const requestDigest = await collectionDigest(reference)
  if (trusted.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || trusted.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const observed = structuredClone(await runCmsDatabaseInvocation(run, () => completeManagedTransfer(reference, { env: trusted, runTransaction: transactionWithoutRetry })))
    const value = await requireManagedTransferCompletionReceipt(observed)
    if (value.operationId !== reference.operationId || value.intentDigest !== reference.intentDigest) return rejected(requestDigest, 409)
    return { ok: true as const, requestDigest, value }
  } catch (error) {
    return rejected(requestDigest, statusCode(error))
  }
}
