import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listAgencyPageStudioReleases } from '~~/server/utils/pageStudio/operations'
export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_PUBLISH')
    return { releases: await listAgencyPageStudioReleases(tenantId) }
  } catch (error) { pageStudioHttpError(error) }
})
