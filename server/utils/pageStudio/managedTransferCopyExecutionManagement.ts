import { createError } from 'h3'
import { ManagedTransferCopyExecutionManagementRequestSchema as Request, ManagedTransferCopyExecutionManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-copy-execution-management'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from './privateRpc'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Transfer copy inspection is unavailable. Check its saved status before retrying.' })
/** Private reference transport only; no local fallback or uncertain-call retry. */
export async function callManagedTransferCopyExecution(input: unknown, dependencies: { env: Record<string, unknown> }) {
  const call = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'managedTransferCopyGraphExecution')
  const request = Request.parse({ ...input as object, expectedEnvironment: dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
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
  const { value } = parsed.data
  if (request.action === 'authorize' ? canonical(value) !== canonical(request.authorization) : !('state' in value) || value.operationId !== request.operationId) throw unavailable()
  return value
}
