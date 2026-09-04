import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { issuePageStudioSession } from '~~/server/utils/pageStudio/sessions'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const parsedSiteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!parsedSiteId.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    }
    const session = await issuePageStudioSession({
      actorId: user.id,
      actorRole: 'client',
      clientId: user.clientId,
      siteId: parsedSiteId.data
    }, { event })
    setResponseHeader(event, 'cache-control', 'private, no-store')
    return { session }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
