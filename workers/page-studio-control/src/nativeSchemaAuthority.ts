import { NATIVE_SCHEMA_AUTHORITY_URL, NativeSchemaContracts, NativeSchemaAuthorityResult, type NativeSchemaKind } from '../../../shared/pageStudio/nativeSchemaAuthority'
import { collectionCanonical } from '../../../shared/pageStudio/collectionApi'
import type { z } from 'zod'
import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const codes = { NATIVE_SCHEMA_INVALID: 400, NATIVE_SCHEMA_DENIED: 403, NATIVE_SCHEMA_UNAVAILABLE: 503 } as const
function failure(code: keyof typeof codes) {
  return Response.json({ error: { code, message: 'Customer CMS authority could not be verified' } }, { status: codes[code], headers })
}
/** Null retains the established nonnative transport. Native requests never fall back. */
export async function authorizeNativeSchemaThroughManagement(request: Request, kind: z.infer<typeof NativeSchemaKind>, dashboardOrigin: string, binding: unknown): Promise<Response | null> {
  try {
    const body = await boundedBody(request.clone(), 16384)
    if (body.tooLarge) return Response.json({ error: { code: 'NATIVE_SCHEMA_TOO_LARGE', message: 'Customer CMS request is too large' } }, { status: 413, headers })
    const parsed = NativeSchemaContracts[kind].schema.safeParse(body.value)
    if (!parsed.success) return failure('NATIVE_SCHEMA_INVALID')
    if (parsed.data.actor.kind !== 'customer-user') return null
    if (parsed.data.scope.environment !== 'staging' || parsed.data.scope.businessId !== parsed.data.scope.clientId) return failure('NATIVE_SCHEMA_INVALID')
    if (dashboardOrigin !== 'https://app.xeroflow.io' || !binding || typeof binding !== 'object'
      || !('fetch' in binding) || typeof binding.fetch !== 'function') return failure('NATIVE_SCHEMA_UNAVAILABLE')
    const response = await binding.fetch(new Request(NATIVE_SCHEMA_AUTHORITY_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, expectedControlPlaneEnvironment: 'production', intent: parsed.data }), redirect: 'manual' }))
    if (!(response instanceof Response) || response.status !== 200) return failure('NATIVE_SCHEMA_UNAVAILABLE')
    const reply = await boundedBody(response, 16384)
    if (reply.tooLarge) return failure('NATIVE_SCHEMA_UNAVAILABLE')
    const result = NativeSchemaAuthorityResult.safeParse(reply.value)
    if (!result.success) return failure('NATIVE_SCHEMA_UNAVAILABLE')
    if (!result.data.ok) return codes[result.data.error.code] === result.data.error.statusCode ? failure(result.data.error.code) : failure('NATIVE_SCHEMA_UNAVAILABLE')
    const value = NativeSchemaContracts[kind].schema.safeParse(result.data.value)
    if (!value.success || collectionCanonical(value.data) !== collectionCanonical(parsed.data)) return failure('NATIVE_SCHEMA_UNAVAILABLE')
    return Response.json(value.data, { headers })
  } catch { return failure('NATIVE_SCHEMA_UNAVAILABLE') }
}
