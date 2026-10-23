import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { CUSTOMER_ADOPTION_URL, CUSTOMER_ADOPTION_UNAVAILABLE, CustomerAdoptionTransportSchema,
  CustomerAdoptionOperatorViewSchema, matchesCustomerAdoptionResponse } from '../../../shared/pageStudio/customerAdoptionTransport'
import { inspectCustomerAdoptionGrant, grantCustomerAdoption, withdrawCustomerAdoptionGrant } from '../../../server/utils/pageStudio/customerAdoptionGrant'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

export async function handleCustomerAdoptionFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== CUSTOMER_ADOPTION_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const configured = () => env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' && env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === 'true'
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return reply(CUSTOMER_ADOPTION_UNAVAILABLE, 400)
    digest = await collectionDigest(body.value)
    const parsed = CustomerAdoptionTransportSchema.safeParse(body.value)
    if (!parsed.success) return reply(CUSTOMER_ADOPTION_UNAVAILABLE, 400)
    if (!configured()) return reply(CUSTOMER_ADOPTION_UNAVAILABLE, 503)
    const { siteId, operator, request: action } = parsed.data
    try {
      const dependencies = { env, runTransaction }
      const result = action.action === 'inspect'
        ? await inspectCustomerAdoptionGrant({ siteId, operator }, dependencies)
        : action.action === 'grant'
          ? await grantCustomerAdoption({ siteId, operator, body: action.body }, dependencies)
          : await withdrawCustomerAdoptionGrant({ siteId, operator, grantId: action.grantId, expectedRevision: action.expectedRevision }, { runTransaction })
      const value = CustomerAdoptionOperatorViewSchema.parse({ ...result, action: action.action, siteId })
      if (!configured() || !matchesCustomerAdoptionResponse(value, parsed.data)) return reply(CUSTOMER_ADOPTION_UNAVAILABLE, 503)
      return reply({ ok: true, requestDigest: digest, value })
    } catch (error) {
      const code = Number((error as { statusCode?: number })?.statusCode)
      return reply({ ok: false, requestDigest: digest, error: { statusCode: [400, 401, 403, 409, 503].includes(code) ? code : 503, message: CUSTOMER_ADOPTION_UNAVAILABLE } })
    }
  } catch { return reply(CUSTOMER_ADOPTION_UNAVAILABLE, 400) }
}
