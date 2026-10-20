import { NativeRuntimeRecoveryProjection } from '../../../shared/pageStudio/nativeRuntimeRecoveryOperator'
import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL, NativeRuntimeRecoveryAuthorityResult, NativeRuntimeRecoveryReference } from '../../../shared/pageStudio/nativeRuntimeRecoveryWire'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'
import { authorizeNativeRuntimeRecovery, handleNativeRuntimeRecoveryOperator } from './nativeRuntimeRecovery'
import { NativeRuntimeRecoveryOperatorSchema } from './nativeRuntimeRecoveryContract'

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const failed = () => ({ ok: false as const, error: { statusCode: 503, message: 'Native CMS recovery authority could not be confirmed.' } })
export async function handleNativeRuntimeRecoveryFetch(request: Request, env: Record<string, unknown>, run: RunPageStudioTransaction) {
  if (request.url !== NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  try {
    const body = await boundedBody(request, 1024)
    if (body.tooLarge) return Response.json(failed(), { status: 413, headers })
    const input = NativeRuntimeRecoveryReference.parse(body.value)
    const value = NativeRuntimeRecoveryAuthorityResult.parse(await authorizeNativeRuntimeRecovery(input, env, run))
    return Response.json(value, { headers })
  } catch { return Response.json(failed(), { status: 503, headers }) }
}
/** Bounded private operator RPC; errors never contain SQL, sessions or intents. */
export async function handleNativeRuntimeRecoveryRpc(input: unknown, env: Record<string, unknown>, run: RunPageStudioTransaction) {
  try {
    const request = NativeRuntimeRecoveryOperatorSchema.parse(input)
    const requestDigest = await collectionDigest(request)
    const value = NativeRuntimeRecoveryProjection.parse(await handleNativeRuntimeRecoveryOperator(request, env, run))
    return { ok: true as const, requestDigest, value }
  } catch { return failed() }
}
