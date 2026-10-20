import { createError } from 'h3'
import { readCmsJsonBody } from './cmsObjectTransport'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { type CustomerSchemaUpgradeRequest, CustomerSchemaUpgradeStatusSchema } from '~~/shared/pageStudio/customerSchemaUpgrade'
import type { CustomerEditorClaims } from '~~/server/utils/pageStudio/customerEditorToken'
import { NATIVE_SCHEMA_COORDINATOR_URL, NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER, NATIVE_SCHEMA_COORDINATOR_ERROR } from '~~/shared/pageStudio/nativeSchemaCoordinator'

const failed = (statusCode = 503) => createError({ statusCode, statusMessage: NATIVE_SCHEMA_COORDINATOR_ERROR })
export async function callNativeSchemaCoordinator(input: CustomerSchemaUpgradeRequest, claims: CustomerEditorClaims, env: Record<string, unknown>) {
  const binding = env.PAGE_STUDIO_MANAGEMENT as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true' || typeof binding?.fetch !== 'function') throw failed()
  const call = binding.fetch.bind(binding)
  // Sole caller has parsed the public request and admitted these claims. Detach
  // before hashing or transport awaits so caller mutation cannot change binding.
  const request = structuredClone({ expectedControlPlaneEnvironment: 'production', request: input, claims }), body = JSON.stringify(request)
  if (new TextEncoder().encode(body).byteLength > 16384) throw failed()
  const digest = await collectionDigest(request)
  let response: Response, value: unknown
  try {
    response = await call(new Request(NATIVE_SCHEMA_COORDINATOR_URL, { method: 'POST', body, redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.headers.get(NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER) !== digest) throw failed()
    value = await readCmsJsonBody(response, 16384, false)
  } catch { throw failed() }
  if (response.status !== 200) {
    if (![400, 401, 403, 409, 503].includes(response.status) || value !== NATIVE_SCHEMA_COORDINATOR_ERROR) throw failed()
    throw failed(response.status)
  }
  const result = CustomerSchemaUpgradeStatusSchema.safeParse(value), a = request.request
  if (!result.success || result.data.kind !== a.kind || (a.action === 'start' && result.data.requestId !== a.requestId) || (a.action === 'recover' && result.data.recoveryId !== a.requestId)) throw failed()
  return result.data
}
