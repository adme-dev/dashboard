import { z } from 'zod'
import { CustomerEditorClaimsSchema } from '../../../server/utils/pageStudio/customerEditorToken'
import { CustomerSchemaUpgradeRequestSchema, CustomerSchemaUpgradeStatusSchema } from '../../../shared/pageStudio/customerSchemaUpgrade'
import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { NATIVE_SCHEMA_COORDINATOR_URL, NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER, NATIVE_SCHEMA_COORDINATOR_ERROR } from '../../../shared/pageStudio/nativeSchemaCoordinator'
import { customerPreviewRuntimeEnvironment } from '../../../server/utils/pageStudio/customerPreviewRuntime'
import { coordinateCustomerSchemaUpgrade } from '../../../server/utils/pageStudio/customerSchemaUpgrade'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

const NativeSchemaCoordinatorRequest = z.object({
  expectedControlPlaneEnvironment: z.literal('production'),
  request: CustomerSchemaUpgradeRequestSchema,
  claims: CustomerEditorClaimsSchema.refine(value => value.environment === 'staging')
}).strict()
/** Placed fetch only. Each unchanged coordinator transaction owns its fresh runner;
 * no transaction spans discovery, execution or a private authority callback. */
export async function handleNativeSchemaCoordinatorFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const configuration = { ...env }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== NATIVE_SCHEMA_COORDINATOR_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let requestDigest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, [NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER]: requestDigest } })
  const rejected = (status = 503) => reply(NATIVE_SCHEMA_COORDINATOR_ERROR, status)
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return rejected(400)
    // Bind even a strict-shape rejection to the actual bounded JSON request.
    // This digest is correlation only; admission still requires parsing below.
    requestDigest = await collectionDigest(body.value)
    const parsed = NativeSchemaCoordinatorRequest.safeParse(body.value)
    if (!parsed.success) return rejected(400)
    const input = structuredClone(parsed.data)
    // Do not allow the preview helper's legacy staging fallback on this capability.
    if (configuration.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return rejected()
    const native = customerPreviewRuntimeEnvironment(configuration)
    if (!native) return rejected()
    const binding = native.PAGE_STUDIO_PROVISIONER as Record<string, (input: unknown) => Promise<unknown>>
    const value = await coordinateCustomerSchemaUpgrade(input.request, input.claims, { binding, runTransaction })
    return reply(CustomerSchemaUpgradeStatusSchema.parse(value))
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return rejected([400, 401, 403, 409].includes(status) ? status : 503)
  }
}
