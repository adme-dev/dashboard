import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { issuePageStudioSession } from '~~/server/utils/pageStudio/sessions'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const parsedSiteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!parsedSiteId.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    }
    const session = await issuePageStudioSession({
      actorId: user.id,
      actorRole: 'agency',
      siteId: parsedSiteId.data,
      tenantId
    }, { event })
    setResponseHeader(event, 'cache-control', 'private, no-store')
    return { session }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
