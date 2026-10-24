import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { RecoveryReviewControlInput, RecoveryReviewPublicView, matchesRecoveryReviewControl, RECOVERY_REVIEW_CONTROL_URL, RECOVERY_REVIEW_CONTROL_UNAVAILABLE } from '../../../shared/pageStudio/transferRecoveryReviewControl'
import { controlCustomerTransferRecoveryReview } from '../../../server/utils/pageStudio/customerTransferRecoveryReviewControl'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

export async function handleTransferRecoveryReviewControlFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }, headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== RECOVERY_REVIEW_CONTROL_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const configured = () => config.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' && config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === 'true'
    && env.PAGE_STUDIO_RELEASE_ENVIRONMENT === config.PAGE_STUDIO_RELEASE_ENVIRONMENT
    && env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return reply(RECOVERY_REVIEW_CONTROL_UNAVAILABLE, 400)
    digest = await collectionDigest(body.value)
    const parsed = RecoveryReviewControlInput.safeParse(body.value)
    if (!parsed.success) return reply(RECOVERY_REVIEW_CONTROL_UNAVAILABLE, 400)
    if (!configured()) return reply(RECOVERY_REVIEW_CONTROL_UNAVAILABLE, 503)
    try {
      const value = RecoveryReviewPublicView.parse(await controlCustomerTransferRecoveryReview(parsed.data, { env: config, runTransaction }))
      if (!configured() || !matchesRecoveryReviewControl(value, parsed.data)) return reply(RECOVERY_REVIEW_CONTROL_UNAVAILABLE, 503)
      return reply({ ok: true, requestDigest: digest, value })
    } catch (error) {
      const code = Number((error as { statusCode?: number })?.statusCode)
      return reply({ ok: false, requestDigest: digest, error: { statusCode: [400, 401, 403, 409, 503].includes(code) ? code : 503, message: RECOVERY_REVIEW_CONTROL_UNAVAILABLE } })
    }
  } catch { return reply(RECOVERY_REVIEW_CONTROL_UNAVAILABLE, 400) }
}
