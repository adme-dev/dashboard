import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { NATIVE_SCHEMA_COORDINATOR_URL, NativeSchemaCoordinatorRequest, NativeSchemaCoordinatorResult } from '../../../shared/pageStudio/nativeSchemaCoordinator'
import { customerPreviewRuntimeEnvironment } from '../../../server/utils/pageStudio/customerPreviewRuntime'
import { coordinateCustomerSchemaUpgrade } from '../../../server/utils/pageStudio/customerSchemaUpgrade'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: 'Customer CMS setup could not be verified.' } })
/** Placed fetch only. Each unchanged coordinator transaction owns its fresh runner;
 * no transaction spans discovery, execution or a private authority callback. */
export async function handleNativeSchemaCoordinatorFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const configuration = { ...env }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== NATIVE_SCHEMA_COORDINATOR_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let requestDigest = '0'.repeat(64)
  try {
    const body = await boundedBody(request, 16384)
    const parsed = NativeSchemaCoordinatorRequest.safeParse(body.value)
    if (body.tooLarge || !parsed.success) return Response.json(rejected(requestDigest, 400), { headers })
    const input = structuredClone(parsed.data)
    requestDigest = await collectionDigest(input)
    // Do not allow the preview helper's legacy staging fallback on this capability.
    if (configuration.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return Response.json(rejected(requestDigest), { headers })
    const native = customerPreviewRuntimeEnvironment(configuration)
    if (!native) return Response.json(rejected(requestDigest), { headers })
    const binding = native.PAGE_STUDIO_PROVISIONER as Record<string, (input: unknown) => Promise<unknown>>
    const value = await coordinateCustomerSchemaUpgrade(input.request, input.claims, { binding, runTransaction })
    const result = NativeSchemaCoordinatorResult.parse({ ok: true, requestDigest, value })
    return Response.json(result, { headers })
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return Response.json(rejected(requestDigest, [400, 401, 403, 409].includes(status) ? status : 503), { headers })
  }
}
