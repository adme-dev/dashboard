import { createError } from 'h3'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TRANSFER_RECOVERY_COORDINATOR_URL, TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE,
  TransferRecoveryCoordinatorTransportSchema, TransferRecoveryCoordinatorResponseSchema, matchesRecoveryInspection } from '~~/shared/pageStudio/transferRecoveryCoordinatorTransport'
import { placedAuthorityFetch } from './placedAuthorityFetch'
/** One explicit private inspection. A lost reply must not trigger another capture. */
export async function callTransferRecoveryInspection(input: unknown, env: Record<string, unknown>) {
  const denied = () => createError({ statusCode: 503, statusMessage: TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE })
  const parsed = TransferRecoveryCoordinatorTransportSchema.safeParse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!parsed.success) throw denied()
  const { request, value } = await placedAuthorityFetch(env.PAGE_STUDIO_MANAGEMENT, TRANSFER_RECOVERY_COORDINATOR_URL, parsed.data, TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE)
  const result = TransferRecoveryCoordinatorResponseSchema.safeParse(value)
  if (!result.success || result.data.requestDigest !== await collectionDigest(request)) throw denied()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  if (!matchesRecoveryInspection(result.data.value, request)) throw denied()
  return result.data.value
}
