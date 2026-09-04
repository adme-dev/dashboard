import { z } from 'zod'

import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { refreshPageStudioDomain } from '~~/server/utils/pageStudio/siteOperations'

const DomainId = z.string().uuid()

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const domainId = DomainId.safeParse(getRouterParam(event, 'domainId'))
    if (!siteId.success || !domainId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio domain ID' })
    return { domain: await refreshPageStudioDomain({
      actorId: user.id,
      domainId: domainId.data,
      event,
      siteId: siteId.data,
      tenantId
    }) }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
