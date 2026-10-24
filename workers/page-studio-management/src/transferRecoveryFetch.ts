import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoveryViewSchema } from '../../../shared/pageStudio/transferRecovery'
import { TRANSFER_RECOVERY_URL, TRANSFER_RECOVERY_UNAVAILABLE, TransferRecoveryTransportSchema } from '../../../shared/pageStudio/transferRecoveryTransport'
import { readCustomerTransferRecovery, changeCustomerTransferRecovery } from '../../../server/utils/pageStudio/customerTransferRecovery'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

/** Fixed private service route. It can inspect/close/revoke PG authority only;
 * the domain helper owns fresh authorization and every transaction. */
export async function handleTransferRecoveryFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== TRANSFER_RECOVERY_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const denied = (status = 503) => reply(TRANSFER_RECOVERY_UNAVAILABLE, status)
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return denied(400)
    digest = await collectionDigest(body.value)
    const parsed = TransferRecoveryTransportSchema.safeParse(body.value)
    if (!parsed.success) return denied(400)
    if (config.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return denied()
    const { siteId, requestId, operator, expectedEnvironment: _environment, ...action } = parsed.data
    try {
      const route = { siteId, requestId, operator }
      const value = TransferRecoveryViewSchema.parse(action.action === 'status'
        ? await readCustomerTransferRecovery({ ...route, query: { expectedRevision: action.expectedRevision } }, { runTransaction })
        : await changeCustomerTransferRecovery({ ...route, body: action }, { runTransaction }))
      if (value.siteId !== siteId || value.requestId !== requestId || value.revision !== action.expectedRevision) return denied()
      return reply({ ok: true, requestDigest: digest, value })
    } catch (error) {
      const code = Number((error as { statusCode?: number })?.statusCode)
      return reply({ ok: false, requestDigest: digest, error: { statusCode: [400, 401, 403, 409, 503].includes(code) ? code : 503,
        message: TRANSFER_RECOVERY_UNAVAILABLE } })
    }
  } catch { return denied(400) }
}
