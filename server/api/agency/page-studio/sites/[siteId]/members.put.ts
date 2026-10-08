import { createError, getHeader, getRequestURL, getRouterParam, setHeader } from 'h3'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioJson } from '~~/server/utils/pageStudio/boundedJson'
import { writeInvitedSiteAccess } from '~~/server/utils/pageStudio/invitedAccess'
import { z } from 'zod'

export default eventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  if (getHeader(event, 'origin') !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, statusMessage: 'Open CMS access in the agency dashboard and try again.' })
  }
  const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
  const body = z.object({ userId: z.string().uuid(), role: z.enum(['editor', 'viewer', 'none']) }).strict()
    .safeParse(await readPageStudioJson(event, 2048, ['CMS access must be JSON', 'CMS access exceeds the size limit', 'CMS access is required', 'Invalid CMS access', 'Invalid CMS access JSON']))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid CMS access request' })
  return writeInvitedSiteAccess({ ...body.data, tenantId, siteId: getRouterParam(event, 'siteId')!, actorId: user.id })
})
