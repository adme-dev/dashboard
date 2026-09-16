import { z } from 'zod'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioVersionComparison } from '~~/server/utils/pageStudio/inspectionClient'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

const Identity = z.string().uuid()
export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const ids = z.object({ siteId: Identity, versionId: Identity, releaseId: Identity.optional() }).safeParse({
      siteId: getRouterParam(event, 'siteId'), versionId: getRouterParam(event, 'versionId'), releaseId: getQuery(event).releaseId
    })
    if (!ids.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website comparison identity' })
    setHeader(event, 'cache-control', 'private, no-store')
    const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
    return await readPageStudioVersionComparison({ ...ids.data, tenantId, actorId: user.id, env })
  } catch (error) { pageStudioHttpError(error) }
})
