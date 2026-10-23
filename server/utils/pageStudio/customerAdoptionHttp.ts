import { createError, getQuery, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { CustomerAdoptionGrantReferenceSchema, CustomerAdoptionSetupRequestSchema } from '~~/shared/pageStudio/customerAdoptionGrant'
import { CustomerCmsAdoptionStatusSchema } from '~~/shared/pageStudio/customerCmsSetup'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { readCustomerSession } from './customerSignup'
import { customerCmsSetupOptions } from './customerCmsSetupHttp'
import { readCustomerAdoptionSetup, mutateCustomerAdoptionSetup } from './customerAdoptionSetup'
import { readPageStudioJson } from './boundedJson'

const Query = z.object({ revision: z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().int().positive().max(2147483646)) }).strict()
const Status = z.object({ resumeRequired: z.boolean(), adoption: CustomerCmsAdoptionStatusSchema.nullable() }).strict()
const Resume = z.object({ resumed: z.literal(true) }).strict()
/** The explicit URL grant must match the body; no selected/latest grant lookup. */
export async function handleCustomerAdoptionHttp(event: H3Event, method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'referrer-policy', 'no-referrer')
  setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')
  try {
    guardCustomerRequest(event, method)
    if (event.method !== method) throw createError({ statusCode: 405 })
    const grantId = z.string().uuid().safeParse(getRouterParam(event, 'grantId'))
    const query = (method === 'GET' ? Query : z.object({}).strict()).safeParse(getQuery(event))
    if (!grantId.success || !query.success) throw createError({ statusCode: 400 })
    const token = customerSessionToken(event), options = customerCmsSetupOptions(event)
    if (!options) throw createError({ statusCode: 403 })
    const principal = await readCustomerSession(token, transactionWithoutRetry)
    await limitCustomerRequest(event, `cms-adoption:${method}:${await digestPortalSessionToken(token)}`, method === 'GET' ? 120 : 30)
    let reference: z.infer<typeof CustomerAdoptionGrantReferenceSchema>, result: unknown
    if (method === 'GET') {
      reference = CustomerAdoptionGrantReferenceSchema.parse({ grantId: grantId.data, revision: Query.parse(getQuery(event)).revision })
      result = Status.parse(await readCustomerAdoptionSetup(token, reference, options))
    } else {
      const parsed = CustomerAdoptionSetupRequestSchema.safeParse(await readPageStudioJson(event, 4096,
        ['Use JSON for this request.', 'The request is too large.', 'Choose an adoption action.', 'Invalid adoption request.', 'Invalid adoption JSON.']))
      if (!parsed.success || parsed.data.grant.grantId !== grantId.data) throw createError({ statusCode: 400 })
      reference = parsed.data.grant
      const value = await mutateCustomerAdoptionSetup(token, parsed.data, options)
      result = parsed.data.operation === 'resume' ? Resume.parse(value) : CustomerCmsAdoptionStatusSchema.parse(value)
    }
    if (collectionCanonical(principal) !== collectionCanonical(await readCustomerSession(token, transactionWithoutRetry))) throw createError({ statusCode: 403 })
    return { grant: reference, result }
  } catch (error) {
    const code = Number((error as { statusCode?: number })?.statusCode)
    throw createError({ statusCode: [400, 401, 403, 405, 409, 413, 415, 429].includes(code) ? code : 503,
      statusMessage: code === 401 ? 'Sign in to continue.' : 'Adoption status could not be confirmed. Refresh before continuing.' })
  }
}
