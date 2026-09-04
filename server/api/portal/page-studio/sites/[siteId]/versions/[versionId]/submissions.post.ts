import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import {
  resolvePortalPageStudioSiteTenant,
  submitPageStudioVersion
} from '~~/server/utils/pageStudio/versions'

const Id = z.string().uuid()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const siteId = Id.safeParse(getRouterParam(event, 'siteId'))
    const versionId = Id.safeParse(getRouterParam(event, 'versionId'))
    if (!siteId.success || !versionId.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio version' })
    }
    const tenantId = await resolvePortalPageStudioSiteTenant({
      clientId: user.clientId,
      siteId: siteId.data,
      userId: user.id
    })
    const version = await submitPageStudioVersion({
      tenantId,
      clientId: user.clientId,
      siteId: siteId.data,
      versionId: versionId.data,
      portalUserId: user.id
    })
    return { version }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
