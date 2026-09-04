import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteQuery } from '~~/server/utils/pageStudio/schemas'
import { listAgencyPageStudioSites } from '~~/server/utils/pageStudio/sites'

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const parsed = PageStudioSiteQuery.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site filters' })
    }
    const { page, pageSize, ...filters } = parsed.data
    const result = await listAgencyPageStudioSites({
      tenantId,
      ...filters,
      limit: pageSize,
      offset: (page - 1) * pageSize
    })
    return { sites: result.items, total: result.total, page, pageSize }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
