import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionCanonical } from '../../../shared/pageStudio/collectionApi'
import { NativeRuntimeRecoveryReference, NativeRuntimeRecoveryAuthorityResult, NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL } from '../../../shared/pageStudio/nativeRuntimeRecoveryWire'

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const failure = () => Response.json({ error: { code: 'NATIVE_RECOVERY_UNAVAILABLE', message: 'Native CMS recovery authority could not be confirmed.' } }, { status: 503, headers })
/** Fixed private receiver only. Missing production configuration never falls back. */
export async function authorizeNativeRuntimeRecoveryThroughManagement(request: Request, dashboardOrigin: string, binding: unknown) {
  try {
    if (request.method !== 'POST' || dashboardOrigin !== 'https://app.xeroflow.io' || !binding || typeof binding !== 'object'
      || !('fetch' in binding) || typeof binding.fetch !== 'function') return failure()
    const body = await boundedBody(request, 1024)
    if (body.tooLarge) return failure()
    const input = NativeRuntimeRecoveryReference.parse(body.value)
    const response = await binding.fetch(new Request(NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), redirect: 'manual'
    }))
    if (!(response instanceof Response) || response.status !== 200) return failure()
    const reply = await boundedBody(response, 4096)
    if (reply.tooLarge) return failure()
    const value = NativeRuntimeRecoveryAuthorityResult.parse(reply.value)
    if (collectionCanonical(value.reference) !== collectionCanonical(input)
      || (input.phase !== 'create' && !value.approval)
      || (value.approval && (value.approval.reviewId !== input.reviewId || value.approval.attemptId !== input.attemptId || value.approval.reviewDigest !== input.reviewDigest))) return failure()
    return Response.json(value, { headers })
  } catch { return failure() }
}
