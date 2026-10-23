import { createError } from 'h3'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { RecoveryReviewControlInput, RecoveryReviewControlResponse, matchesRecoveryReviewControl, RECOVERY_REVIEW_CONTROL_URL, RECOVERY_REVIEW_CONTROL_UNAVAILABLE } from '~~/shared/pageStudio/transferRecoveryReviewControl'
import { placedAuthorityFetch } from './placedAuthorityFetch'
/** One request, no fallback or mutation retry. Cookie credentials stay inside
 * the private service envelope and are never returned in the projected view. */
export async function callTransferRecoveryReviewControl(input: unknown, env: Record<string, unknown>) {
  const fail = () => createError({ statusCode: 503, statusMessage: RECOVERY_REVIEW_CONTROL_UNAVAILABLE })
  const parsed = RecoveryReviewControlInput.safeParse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!parsed.success) throw fail()
  const { request, value } = await placedAuthorityFetch(env.PAGE_STUDIO_MANAGEMENT, RECOVERY_REVIEW_CONTROL_URL, parsed.data, RECOVERY_REVIEW_CONTROL_UNAVAILABLE)
  const result = RecoveryReviewControlResponse.safeParse(value)
  if (!result.success || result.data.requestDigest !== await collectionDigest(request)) throw fail()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  if (!matchesRecoveryReviewControl(result.data.value, request)) throw fail()
  return result.data.value
}
