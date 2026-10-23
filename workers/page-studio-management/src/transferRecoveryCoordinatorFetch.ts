import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoveryInspectionViewSchema } from '../../../shared/pageStudio/transferRecoveryCoordinator'
import { TRANSFER_RECOVERY_COORDINATOR_URL, TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE,
  TransferRecoveryCoordinatorTransportSchema, matchesRecoveryInspection } from '../../../shared/pageStudio/transferRecoveryCoordinatorTransport'
import { inspectCustomerTransferRecovery } from '../../../server/utils/pageStudio/customerTransferRecoveryCoordinator'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'
/** Private POST only; current operator authority is checked inside each short PG transaction. */
export async function handleTransferRecoveryCoordinatorFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== TRANSFER_RECOVERY_COORDINATOR_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const denied = (status = 503) => reply(TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE, status)
  const configured = () => env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' && env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === 'true'
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return denied(400)
    digest = await collectionDigest(body.value)
    const parsed = TransferRecoveryCoordinatorTransportSchema.safeParse(body.value)
    if (!parsed.success) return denied(400)
    if (!configured()) return denied()
    const { siteId, requestId, operator, expectedEnvironment: _environment, ...action } = parsed.data
    try {
      const value = TransferRecoveryInspectionViewSchema.parse(await inspectCustomerTransferRecovery({ siteId, requestId, operator, body: action }, { env, runTransaction }))
      if (!configured() || !matchesRecoveryInspection(value, parsed.data)) return denied()
      return reply({ ok: true, requestDigest: digest, value })
    } catch (error) {
      const code = Number((error as { statusCode?: number })?.statusCode)
      return reply({ ok: false, requestDigest: digest, error: { statusCode: [400, 401, 403, 409, 503].includes(code) ? code : 503,
        message: TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE } })
    }
  } catch { return denied(400) }
}
