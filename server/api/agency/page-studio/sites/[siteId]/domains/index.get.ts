import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { listPageStudioDomains } from '~~/server/utils/pageStudio/siteOperations'

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    return { domains: await listPageStudioDomains(tenantId, siteId.data) }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
