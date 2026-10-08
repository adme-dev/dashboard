import { createError, getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readInvitedSiteAccess } from '~~/server/utils/pageStudio/invitedAccess'
import { pageStudioInvitedOrigin } from '~~/server/utils/pageStudio/invitedOrigin'

export default eventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
  const siteId = getRouterParam(event, 'siteId')
  if (!z.string().uuid().safeParse(siteId).success) throw createError({ statusCode: 400, statusMessage: 'Invalid website' })
  const result = await readInvitedSiteAccess({ tenantId, siteId: siteId!, actorId: user.id })
  return { ...result, cmsUrl: `${pageStudioInvitedOrigin(event)}/studio/sites/${siteId}` }
})
