import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoveryInspectionWireSchema, TransferRecoveryInspectionWireAcknowledgmentSchema, TRANSFER_RECOVERY_INSPECTION_URL, TRANSFER_RECOVERY_INSPECTION_UNAVAILABLE } from '../../../shared/pageStudio/transferRecoveryInspectionTransport'
import { authorizeCustomerTransferRecoveryInspection } from '../../../server/utils/pageStudio/customerTransferRecoveryInspection'
import { authorizeCustomerTransferRecoveryInventory } from '../../../server/utils/pageStudio/customerTransferRecoveryInventory'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

/** Fresh PG inspection of one detached private envelope; no automatic retries,
 * grants, D1 effects or execution admission. */
export async function handleTransferRecoveryInspectionFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== TRANSFER_RECOVERY_INSPECTION_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const denied = (status = 503) => reply(TRANSFER_RECOVERY_INSPECTION_UNAVAILABLE, status)
  let envelope
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return denied(400)
    digest = await collectionDigest(body.value)
    const parsed = TransferRecoveryInspectionWireSchema.safeParse(body.value)
    if (!parsed.success) return denied(400)
    envelope = parsed.data
  } catch { return denied(400) }
  if (config.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return denied()
  try {
    const result = TransferRecoveryInspectionWireAcknowledgmentSchema.safeParse(envelope.purpose === 'inventory'
      ? await authorizeCustomerTransferRecoveryInventory(envelope, { runTransaction })
      : await authorizeCustomerTransferRecoveryInspection(envelope, { runTransaction }))
    if (!result.success || result.data.purpose !== envelope.purpose || result.data.envelopeDigest !== digest) return denied()
    return reply(result.data)
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return denied([400, 401, 403, 409].includes(status) ? status : 503)
  }
}
