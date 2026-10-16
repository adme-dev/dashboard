import { createError } from 'h3'
import { ManagedTransferDestinationAuthoringManagementRequestSchema as Request, ManagedTransferDestinationAuthoringManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-destination-authoring-management'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from './privateRpc'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Completed destination authoring is unavailable. Retry the same request.' })
/** Fixed production management transport only. Worker owns complete schema and
 * SQL authority. No Pages database fallback or uncertain-call retry exists. */
async function call(input: unknown, dependencies: {
  env: Record<string, unknown>
}) {
  const remote = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'managedTransferDestinationAuthoring')
  if (!remote || dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production')
    throw unavailable()
  const request = structuredClone(Request.parse({ ...input as object, expectedEnvironment: dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT }))
  if (new TextEncoder().encode(canonical(request)).byteLength > 300000)
    throw unavailable()
  const requestDigest = await collectionDigest(request)
  let response: unknown
  try {
    response = structuredClone(await remote(structuredClone(request)))
  } catch {
    throw unavailable()
  }
  const parsed = Result.safeParse(response)
  if (!parsed.success || parsed.data.requestDigest !== requestDigest)
    throw unavailable()
  if (!parsed.data.ok)
    throw createError({ statusCode: parsed.data.error.statusCode, statusMessage: parsed.data.error.message })
  if (request.action === 'authorize' && canonical(parsed.data.value) !== canonical(request.authorization))
    throw unavailable()
  return parsed.data.value
}
export function readManagedTransferDestinationAuthoring(input: unknown, dependencies: {
  env: Record<string, unknown>
}) {
  return call({ ...input as object, action: 'read' }, dependencies)
}
export function authorizeManagedTransferDestinationAuthoring(authorization: unknown, dependencies: {
  env: Record<string, unknown>
}) {
  return call({ action: 'authorize', authorization }, dependencies)
}
