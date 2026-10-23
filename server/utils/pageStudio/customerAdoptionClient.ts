import { createError } from 'h3'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { CUSTOMER_ADOPTION_URL, CUSTOMER_ADOPTION_UNAVAILABLE, CustomerAdoptionTransportSchema,
  CustomerAdoptionTransportResponseSchema, matchesCustomerAdoptionResponse } from '~~/shared/pageStudio/customerAdoptionTransport'
import { placedAuthorityFetch } from './placedAuthorityFetch'

/** Explicit one-shot action; uncertain acknowledgements never trigger a retry. */
export async function callCustomerAdoptionGrant(input: unknown, env: Record<string, unknown>) {
  const fail = () => createError({ statusCode: 503, statusMessage: CUSTOMER_ADOPTION_UNAVAILABLE })
  const parsed = CustomerAdoptionTransportSchema.safeParse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!parsed.success) throw fail()
  const { request, value } = await placedAuthorityFetch(env.PAGE_STUDIO_MANAGEMENT, CUSTOMER_ADOPTION_URL, parsed.data, CUSTOMER_ADOPTION_UNAVAILABLE)
  const result = CustomerAdoptionTransportResponseSchema.safeParse(value)
  if (!result.success || result.data.requestDigest !== await collectionDigest(request)) throw fail()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  if (!matchesCustomerAdoptionResponse(result.data.value, request)) throw fail()
  return result.data.value
}
