import { createError } from 'h3'
import { ManagedTransferSourceRetentionManagementRequestSchema as Request, ManagedTransferSourceRetentionManagementResultSchema as Result } from '~~/shared/pageStudio/managed-transfer-source-retention-management'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { capturePageStudioRpcMethod } from './privateRpc'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Completed source retention is unavailable. Check saved status before retrying.' })
/** Fixed private callback transport; complete proof/SQL validation is Worker-only. */
export async function authorizeManagedTransferSourceRetention(authorization: unknown, dependencies: { env: Record<string, unknown> }) {
  const env = dependencies.env
  const remote = capturePageStudioRpcMethod(env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'managedTransferSourceRetention')
  if (!remote || env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const request = structuredClone(Request.parse({ expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT, authorization }))
  if (new TextEncoder().encode(canonical(request)).byteLength > 65536) throw unavailable()
  const requestDigest = await collectionDigest(request)
  let response: unknown
  try {
    response = structuredClone(await remote(structuredClone(request)))
  } catch {
    throw unavailable()
  }
  const parsed = Result.safeParse(response)
  if (!parsed.success || parsed.data.requestDigest !== requestDigest) throw unavailable()
  if (!parsed.data.ok) throw createError({ statusCode: parsed.data.error.statusCode, statusMessage: parsed.data.error.message })
  if (canonical(parsed.data.value) !== canonical(request.authorization)) throw unavailable()
  return parsed.data.value
}
