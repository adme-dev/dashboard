import { z } from 'zod'

import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { revokePageStudioSession } from '~~/server/utils/pageStudio/siteOperations'

const SessionId = z.string().min(16).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    const sessionId = SessionId.safeParse(getRouterParam(event, 'sessionId'))
    if (!siteId.success || !sessionId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio session ID' })
    return await revokePageStudioSession({
      actorId: user.id,
      sessionId: sessionId.data,
      siteId: siteId.data,
      tenantId
    })
  } catch (error) {
    pageStudioHttpError(error)
  }
})
