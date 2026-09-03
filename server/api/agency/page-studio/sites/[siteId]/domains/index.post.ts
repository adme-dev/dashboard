import { z } from 'zod'

import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { attachPageStudioDomain } from '~~/server/utils/pageStudio/siteOperations'

const DomainBody = z.object({
  hostname: z.string().trim().toLowerCase().max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
}).strict()

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const body = DomainBody.safeParse(await readBody(event))
    if (!siteId.success || !body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio hostname' })
    const domain = await attachPageStudioDomain({
      actorId: user.id,
      event,
      hostname: body.data.hostname,
      siteId: siteId.data,
      tenantId
    })
    setResponseStatus(event, 201)
    return { domain }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
