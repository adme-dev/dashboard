import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { getPageStudioDocument } from '~~/server/utils/pageStudio/documents'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    return await getPageStudioDocument(tenantId, siteId.data)
  } catch (error) {
    pageStudioHttpError(error)
  }
})
