import { createError } from 'h3'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TRANSFER_RECOVERY_URL, TRANSFER_RECOVERY_UNAVAILABLE, TransferRecoveryTransportSchema, TransferRecoveryResponseSchema } from '~~/shared/pageStudio/transferRecoveryTransport'
import { placedAuthorityFetch } from './placedAuthorityFetch'

/** One fixed private call. Uncertain replies never cause an automatic retry. */
export async function callTransferRecovery(input: unknown, env: Record<string, unknown>) {
  const unavailable = () => createError({ statusCode: 503, statusMessage: TRANSFER_RECOVERY_UNAVAILABLE })
  const parsed = TransferRecoveryTransportSchema.safeParse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!parsed.success) throw unavailable()
  const { request, value } = await placedAuthorityFetch(env.PAGE_STUDIO_MANAGEMENT, TRANSFER_RECOVERY_URL, parsed.data, TRANSFER_RECOVERY_UNAVAILABLE)
  const result = TransferRecoveryResponseSchema.safeParse(value)
  if (!result.success || result.data.requestDigest !== await collectionDigest(request)) throw unavailable()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  const view = result.data.value
  if (view.siteId !== request.siteId || view.requestId !== request.requestId || view.revision !== request.expectedRevision) throw unavailable()
  if (request.action !== 'status') {
    if (!view.recovery || view.recovery.recoveryId !== request.recoveryId) throw unavailable()
    // An exact open replay may read its later revoked head. It must never
    // reinterpret that history as a fresh review or select a successor epoch.
    if (request.action === 'open' && (view.recovery.epoch !== 1
      || view.recovery.version !== (view.recovery.state === 'reconciling' ? 1 : 2)
      || Date.parse(view.recovery.deadline) !== Date.parse(request.deadline))) throw unavailable()
    if (request.action === 'revoke' && (view.recovery.state !== 'revoked'
      || view.recovery.version !== request.expectedHeadVersion + 1)) throw unavailable()
  }
  return view
}
