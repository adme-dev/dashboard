import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listAgencyPageStudioReviews } from '~~/server/utils/pageStudio/operations'
export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    return { reviews: await listAgencyPageStudioReviews(tenantId) }
  } catch (error) { pageStudioHttpError(error) }
})
