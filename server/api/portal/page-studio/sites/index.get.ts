import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteQuery } from '~~/server/utils/pageStudio/schemas'
import { listPortalPageStudioSites } from '~~/server/utils/pageStudio/sites'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const rawQuery = getQuery(event)
    const parsed = PageStudioSiteQuery.pick({ page: true, pageSize: true }).safeParse(rawQuery)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site filters' })
    }
    const { page, pageSize } = parsed.data
    const result = await listPortalPageStudioSites({
      clientId: user.clientId,
      userId: user.id,
      limit: pageSize,
      offset: (page - 1) * pageSize
    })
    return { sites: result.items, total: result.total, page, pageSize }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
