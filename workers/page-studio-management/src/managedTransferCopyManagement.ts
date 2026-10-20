import { hasCustomerPreviewRuntimeConfiguration } from '~~/server/utils/pageStudio/customerPreviewRuntime'
import { ManagedTransferCopyManagementRequestSchema as Request, ManagedTransferCopyManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-copy-management'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { prepareManagedTransferCopyGraph, readManagedTransferCopyGraph } from './managedTransferCopyAdmission'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: statusCode === 403 ? 'Transfer copy admission access denied.' : 'Transfer copy admission is unavailable. Check its saved status before retrying.' } })
function capture(service: unknown, methods: string[]) {
  return Object.fromEntries(methods.map(method => [method, capturePageStudioRpcMethod(service as Record<string, unknown> | undefined, method)]))
}
/** Service binding only. Production ownership is re-resolved under the original
 * native session and entitlement for every read/prepare operation. */
export async function handleManagedTransferCopyManagement(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = Request.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data)
  const storage = {
    ...(hasCustomerPreviewRuntimeConfiguration(env)
      ? {
          PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED,
          PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: env.PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN,
          PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: capture(env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER, ['createProvisioning', 'readProvisioning']),
          PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: capture(env.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER, ['readManagedCmsTarget', 'readManagedCmsObjectsAtTarget', 'fetch']),
          PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: capture(env.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS, ['get'])
        }
      : {}),
    PAGE_STUDIO_RELEASE_ENVIRONMENT: env.PAGE_STUDIO_RELEASE_ENVIRONMENT,
    PAGE_STUDIO_PROVISIONING_ENVIRONMENT: env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT,
    MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY,
    PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: capture(env.PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER, ['readManagedCmsTarget', 'readManagedCmsObjectsAtTarget', 'fetch']),
    PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: capture(env.PAGE_STUDIO_CMS_STAGING_CHECKPOINTS, ['get']),
    PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT: env.PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT
  }
  const requestDigest = await collectionDigest(request)
  if (storage.PAGE_STUDIO_RELEASE_ENVIRONMENT !== request.expectedEnvironment || storage.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, () => {
      const reference = { operationId: request.operationId, intentDigest: request.intentDigest }
      const dependencies = { env: storage, runTransaction: transactionWithoutRetry }
      return request.action === 'prepare' ? prepareManagedTransferCopyGraph(reference, dependencies) : readManagedTransferCopyGraph(reference, dependencies)
    })
    return Result.parse({ ok: true, requestDigest, value: value
      ? { operationId: request.operationId, state: 'copy-admitted', admissionDigest: await collectionDigest(value) }
      : { operationId: request.operationId, state: 'not-started' } })
  } catch (error) {
    const code = (error as { statusCode?: number })?.statusCode
    return rejected(requestDigest, code && [401, 403, 409, 413].includes(code) ? code : 503)
  }
}
