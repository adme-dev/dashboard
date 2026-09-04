import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listAgencyPageStudioDomains } from '~~/server/utils/pageStudio/operations'
export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_DOMAINS')
    return { domains: await listAgencyPageStudioDomains(tenantId) }
  } catch (error) { pageStudioHttpError(error) }
})
