import { createError, getQuery, getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { guardCustomerRequest, customerSessionToken } from '~~/server/utils/pageStudio/customerSignupHttp'
import { readCustomerManagedTransfer } from '~~/server/utils/pageStudio/customerManagedTransfer'
import { readCustomerLaunchContext } from '~~/server/utils/pageStudio/customerLaunchContext'
import { readCustomerPageStudioLaunchState } from '~~/server/utils/pageStudio/inspectionClient'
import { productionCandidateAvailable } from '~~/server/utils/pageStudio/candidateAvailability'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    guardCustomerRequest(event, 'GET')
    const token = customerSessionToken(event)
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success || !z.object({}).strict().safeParse(getQuery(event)).success)
      throw createError({ statusCode: 400, statusMessage: 'Invalid website launch request' })
    const before = await readCustomerLaunchContext(token, siteId.data)
    const state = await readCustomerPageStudioLaunchState({ ...before.actor, env: event.context.cloudflare?.env as Record<string, unknown> | undefined })
    const available = state.canManagePublication === true && state.deliveryMode === 'static'
      && state.content?.requiresSealedFeatures === false && await productionCandidateAvailable(event)
    const managedTransfer = await readCustomerManagedTransfer(token, siteId.data, { env: event.context.cloudflare?.env ?? {} })
    // The compiler inspection can also await remote work. Recheck the same
    // original login last; a newer login must not substitute for this one.
    const after = await readCustomerLaunchContext(token, siteId.data)
    if (JSON.stringify(before.actor) !== JSON.stringify(after.actor) || before.scope.tenantId !== after.scope.tenantId
      || before.scope.clientId !== after.scope.clientId) throw createError({ statusCode: 403, statusMessage: 'Website access changed. Refresh your dashboard.' })
    const canManagePublication = state.canManagePublication === true && after.scope.canManagePublication === true
    return { ...state, managedTransfer, canManagePublication, candidateReview: canManagePublication && available }
  } catch (error) { pageStudioHttpError(error) }
})
