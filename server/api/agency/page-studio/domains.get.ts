import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listAgencyPageStudioDomains } from '~~/server/utils/pageStudio/domainManagementClient'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_DOMAINS')
    return { domains: await listAgencyPageStudioDomains(tenantId, user.id, event) }
  } catch (error) { pageStudioHttpError(error) }
})
