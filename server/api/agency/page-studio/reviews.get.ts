import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listAgencyPageStudioReviews } from '~~/server/utils/pageStudio/inspectionClient'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    setHeader(event, 'cache-control', 'private, no-store')
    return { reviews: await listAgencyPageStudioReviews({ tenantId, actorId: user.id, env: event.context.cloudflare?.env as Record<string, unknown> | undefined }) }
  } catch (error) { pageStudioHttpError(error) }
})
