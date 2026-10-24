import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoverySourceFreezeRequestSchema, TransferRecoverySourceFreezeAcknowledgmentSchema, TRANSFER_RECOVERY_SOURCE_FREEZE_URL, TRANSFER_RECOVERY_SOURCE_FREEZE_UNAVAILABLE, TRANSFER_RECOVERY_SOURCE_FREEZE_MAX_BYTES } from '../../../shared/pageStudio/transferRecoverySourceFreezeTransport'
import { authorizeCustomerTransferRecoverySourceFreeze } from '../../../server/utils/pageStudio/customerTransferRecoverySourceFreezeAuthority'
import { TransferRecoverySourceFreezeDescriptorSchema } from '../../../shared/pageStudio/transferRecoverySourceFreeze'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

/** Fresh purpose-bound PG freeze authority. No transition, D1 write or
 * provider effect is performed by this receiver. */
export async function handleTransferRecoverySourceFreezeFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }
  const unchanged = () => ['PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED',
    'PAGE_STUDIO_PROVISIONING_ENVIRONMENT', 'MANAGED_TRANSFER_EXECUTION_POLICY', 'MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY', 'MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY'].every(key => env[key] === config[key])
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== TRANSFER_RECOVERY_SOURCE_FREEZE_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const denied = (status = 503) => reply(TRANSFER_RECOVERY_SOURCE_FREEZE_UNAVAILABLE, status)
  let envelope
  try {
    const body = await boundedBody(request, TRANSFER_RECOVERY_SOURCE_FREEZE_MAX_BYTES)
    if (body.tooLarge) return denied(400)
    digest = await collectionDigest(body.value)
    const parsed = TransferRecoverySourceFreezeRequestSchema.safeParse(body.value)
    if (!parsed.success) return denied(400)
    envelope = parsed.data
  } catch { return denied(400) }
  if (config.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true' || !unchanged()) return denied()
  try {
    // Trusted configuration, never inferred from the caller's ABI descriptor.
    const policy = config.MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY
    if (typeof policy !== 'string' || policy.length > 4096) return denied()
    const freezeDescriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(JSON.parse(policy))
    if (freezeDescriptor.layoutDigest !== envelope.descriptor.layoutDigest || !unchanged()) return denied()
    const result = TransferRecoverySourceFreezeAcknowledgmentSchema.safeParse(await authorizeCustomerTransferRecoverySourceFreeze(envelope, { env, runTransaction, freezeDescriptor }))
    if (!unchanged() || !result.success || result.data.purpose !== envelope.purpose || result.data.envelopeDigest !== digest) return denied()
    return reply(result.data)
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return denied([400, 401, 403, 409].includes(status) ? status : 503)
  }
}
