import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listPortalPageStudioDomains } from '~~/server/utils/pageStudio/operations'
export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    return { domains: await listPortalPageStudioDomains(user.clientId, user.id) }
  } catch (error) { pageStudioHttpError(error) }
})
