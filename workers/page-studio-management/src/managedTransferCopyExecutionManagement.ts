import { ManagedTransferCopyExecutionManagementRequestSchema as Request, ManagedTransferCopyExecutionManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-copy-execution-management'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { authorizeManagedTransferCopyGraph, coordinateManagedTransferCopyGraph } from './managedTransferCopyCoordinator'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: statusCode === 403 ? 'Transfer copy access denied.' : 'Transfer copy inspection is unavailable. Check its saved status before retrying.' } })
/** Service binding only; trusted production worker config supplies all services. */
export async function handleManagedTransferCopyExecutionManagement(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = Request.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data)
  const service = env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const storage = { PAGE_STUDIO_RELEASE_ENVIRONMENT: env.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    PAGE_STUDIO_PROVISIONING_ENVIRONMENT: env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT,
    MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY,
    PAGE_STUDIO_PROVISIONER: Object.fromEntries(['readManagedTransferCopyGraph', 'prepareManagedTransferCopyGraph', 'inspectManagedTransferCopyGraph']
      .map(method => [method, capturePageStudioRpcMethod(service, method)])) }
  const requestDigest = await collectionDigest(request)
  if (storage.PAGE_STUDIO_RELEASE_ENVIRONMENT !== request.expectedEnvironment || storage.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, async (): Promise<unknown> => {
      const dependencies = { env: storage, runTransaction: transactionWithoutRetry }
      return request.action === 'authorize'
        ? authorizeManagedTransferCopyGraph(request.authorization, dependencies)
        : coordinateManagedTransferCopyGraph({ operationId: request.operationId, intentDigest: request.intentDigest, action: request.action }, dependencies)
    })
    return Result.parse({ ok: true, requestDigest, value })
  } catch (error) {
    const code = (error as { statusCode?: number })?.statusCode
    return rejected(requestDigest, code && [401, 403, 409, 413].includes(code) ? code : 503)
  }
}
