import { createError, getQuery, getRouterParam, setHeader } from 'h3'
import { CustomerManagedTransferRecoverySchema } from '~~/shared/pageStudio/customerManagedTransfer'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from '~~/server/utils/pageStudio/customerSignupHttp'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { readPageStudioJson } from '~~/server/utils/pageStudio/boundedJson'
import { recoverCustomerManagedTransfer } from '~~/server/utils/pageStudio/customerManagedTransfer'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    guardCustomerRequest(event, 'POST')
    const token = customerSessionToken(event)
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const body = CustomerManagedTransferRecoverySchema.safeParse(await readPageStudioJson(event, 1024,
      ['Use JSON for this request.', 'The request is too large.', 'Choose a recovery action.', 'Invalid recovery request.', 'Invalid recovery JSON.']))
    if (!siteId.success || !body.success || Object.keys(getQuery(event)).length) throw createError({ statusCode: 400 })
    await limitCustomerRequest(event, `transfer-recovery:${await digestPortalSessionToken(token)}`, 20)
    return await recoverCustomerManagedTransfer(token, siteId.data, body.data, { env: event.context.cloudflare?.env ?? {} })
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    const statusCode = status && [400, 401, 403, 404, 405, 409, 413, 415, 429].includes(status) ? status : 503
    throw createError({ statusCode, statusMessage: statusCode === 401 ? 'Sign in to continue.' : 'Refresh your website status before trying again. Your saved website has been kept.' })
  }
})
