import { createError, getQuery, getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { readPortalPageStudioLaunchState } from '~~/server/utils/pageStudio/inspectionClient'
import { productionCandidateAvailable } from '~~/server/utils/pageStudio/candidateAvailability'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success || !z.object({}).strict().safeParse(getQuery(event)).success)
      throw createError({ statusCode: 400, statusMessage: 'Invalid website launch request' })
    const state = await readPortalPageStudioLaunchState({ actorId: user.id, clientId: user.clientId, siteId: siteId.data,
      env: event.context.cloudflare?.env as Record<string, unknown> | undefined })
    const candidateReview = state.canManagePublication === true && state.deliveryMode === 'static'
      && state.content?.requiresSealedFeatures === false && await productionCandidateAvailable(event)
    return { ...state, candidateReview }
  } catch (error) { pageStudioHttpError(error) }
})
