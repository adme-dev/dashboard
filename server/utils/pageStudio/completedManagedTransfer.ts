import { createError } from 'h3'
import { CompletedManagedTransferManagementRequestSchema as Request, CompletedManagedTransferManagementResultSchema as Result } from '~~/shared/pageStudio/completed-managed-transfer-management'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from './privateRpc'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Completed transfer status is unavailable. Check saved status before retrying.' })
/** Small fixed service transport. There is no Pages SQL/finalization fallback,
 * automatic write retry, arbitrary management method or full proof dependency. */
export async function callCompletedManagedTransfer(input: unknown, dependencies: {
  env: Record<string, unknown>
}) {
  const remote = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'completedManagedTransfer')
  const request = Request.parse({ ...input as object, expectedEnvironment: dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!remote || dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production')
    throw unavailable()
  const requestDigest = await collectionDigest(request)
  let raw: unknown
  try {
    raw = structuredClone(await remote(structuredClone(request)))
  } catch {
    throw unavailable()
  }
  const parsed = Result.safeParse(raw)
  if (!parsed.success || parsed.data.requestDigest !== requestDigest)
    throw unavailable()
  if (!parsed.data.ok)
    throw createError({ statusCode: parsed.data.error.statusCode, statusMessage: parsed.data.error.message })
  if (parsed.data.value.siteId !== request.siteId)
    throw unavailable()
  return parsed.data.value
}
