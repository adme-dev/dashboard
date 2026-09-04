import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listAgencyPageStudioSubscriptions } from '~~/server/utils/pageStudio/operations'
export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_SUBSCRIPTIONS')
    return { subscriptions: await listAgencyPageStudioSubscriptions(tenantId) }
  } catch (error) { pageStudioHttpError(error) }
})
