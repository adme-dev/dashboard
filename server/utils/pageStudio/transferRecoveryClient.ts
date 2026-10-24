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
    // The private authority verifies the immutable original open event. A
    // later approval can only shorten its deadline; preserve that history.
    if (request.action === 'open') {
      const head = view.recovery
      const approvedHistory = (head.state === 'approved' && head.version === 2)
        || (head.state === 'pending' && head.version === 3)
        || (head.state === 'applied' && head.version === 4)
        || (head.state === 'revoked' && [3, 4, 5].includes(head.version))
      const initialHistory = (head.state === 'reconciling' && head.version === 1)
        || (head.state === 'revoked' && head.version === 2)
      const deadline = Date.parse(head.deadline), original = Date.parse(request.deadline)
      if (head.epoch !== 1 || (!approvedHistory && !initialHistory)
        || (approvedHistory ? deadline > original : deadline !== original)) throw unavailable()
    }
    if (request.action === 'revoke' && (view.recovery.state !== 'revoked'
      || view.recovery.version !== request.expectedHeadVersion + 1)) throw unavailable()
  }
  return view
}
