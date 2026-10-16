import { ManagedTransferSourceRetentionManagementRequestSchema as Request, ManagedTransferSourceRetentionManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-source-retention-management'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import { authorizeManagedTransferSourceRetention } from './managedTransferSourceRetention'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'

type Runner = <T>(work: (db: PageStudioQueryClient) => Promise<T>) => Promise<T>
const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: 'Completed source retention is unavailable. Check saved status before retrying.' } })
export async function handleManagedTransferSourceRetentionManagement(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = Request.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data)
  if (new TextEncoder().encode(canonical(request)).byteLength > 65536) return rejected('0'.repeat(64), 413)
  const requestDigest = await collectionDigest(request)
  const storage = { PAGE_STUDIO_RELEASE_ENVIRONMENT: env.PAGE_STUDIO_RELEASE_ENVIRONMENT, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT,
    MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY }
  if (storage.PAGE_STUDIO_RELEASE_ENVIRONMENT !== request.expectedEnvironment || storage.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, () => authorizeManagedTransferSourceRetention(request.authorization, { env: storage, runTransaction: transactionWithoutRetry }))
    return Result.parse({ ok: true, requestDigest, value })
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    return rejected(requestDigest, status && [400, 401, 403, 409, 413].includes(status) ? status : 503)
  }
}
