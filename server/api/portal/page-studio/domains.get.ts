import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listPortalPageStudioDomains } from '~~/server/utils/pageStudio/domainManagementClient'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    return { domains: await listPortalPageStudioDomains(user.clientId, user.id, event) }
  } catch (error) { pageStudioHttpError(error) }
})
