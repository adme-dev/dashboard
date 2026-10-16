import { createError } from 'h3'
import { ManagedTransferCopyManagementRequestSchema as Request, ManagedTransferCopyManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-copy-management'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from './privateRpc'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Transfer copy admission is unavailable. Check its saved status before retrying.' })
/** Private reference only; the management Worker resolves all native authority.
 * No local mutation fallback or automatic replay after an uncertain RPC. */
export async function coordinateManagedTransferCopyGraph(input: unknown, dependencies: { env: Record<string, unknown> }) {
  const call = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'managedTransferCopyGraph')
  const request = Request.parse({ ...Request.omit({ expectedEnvironment: true }).parse(structuredClone(input)), expectedEnvironment: dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!call) throw unavailable()
  const requestDigest = await collectionDigest(request)
  let response: unknown
  try {
    response = structuredClone(await call(structuredClone(request)))
  } catch {
    throw unavailable()
  }
  const parsed = Result.safeParse(response)
  if (!parsed.success || parsed.data.requestDigest !== requestDigest) throw unavailable()
  if (!parsed.data.ok) throw createError({ statusCode: parsed.data.error.statusCode, statusMessage: parsed.data.error.message })
  if (parsed.data.value.operationId !== request.operationId) throw unavailable()
  return parsed.data.value
}
