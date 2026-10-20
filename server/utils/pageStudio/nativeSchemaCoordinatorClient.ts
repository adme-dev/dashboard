import { createError } from 'h3'
import { boundedBody } from '~~/shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { NATIVE_SCHEMA_COORDINATOR_URL, NativeSchemaCoordinatorRequest, NativeSchemaCoordinatorResult } from '~~/shared/pageStudio/nativeSchemaCoordinator'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Customer CMS setup could not be verified.' })
/** Fixed production service binding only. Never retry an uncertain schema action. */
export async function callNativeSchemaCoordinator(input: unknown, claims: unknown, env: Record<string, unknown>) {
  const binding = env.PAGE_STUDIO_MANAGEMENT as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true'
    || typeof binding?.fetch !== 'function') throw unavailable()
  const call = binding.fetch.bind(binding)
  const request = NativeSchemaCoordinatorRequest.safeParse({ expectedControlPlaneEnvironment: 'production', request: input, claims })
  if (!request.success) throw createError({ statusCode: 400, statusMessage: 'Invalid CMS setup request.' })
  const body = JSON.stringify(request.data)
  if (new TextEncoder().encode(body).byteLength > 16384) throw unavailable()
  const requestDigest = await collectionDigest(request.data)
  let reply: unknown
  try {
    const response = await call(new Request(NATIVE_SCHEMA_COORDINATOR_URL, { method: 'POST', body, redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.status !== 200) throw unavailable()
    const value = await boundedBody(response, 16384)
    if (value.tooLarge) throw unavailable()
    reply = value.value
  } catch { throw unavailable() }
  const result = NativeSchemaCoordinatorResult.safeParse(reply)
  if (!result.success || result.data.requestDigest !== requestDigest) throw unavailable()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  const value = result.data.value, action = request.data.request
  if (value.kind !== action.kind || (action.action === 'start' && value.requestId !== action.requestId)
    || (action.action === 'recover' && value.recoveryId !== action.requestId)) throw unavailable()
  return value
}
