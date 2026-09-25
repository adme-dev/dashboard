import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioLaunchState } from '~~/server/utils/pageStudio/inspectionClient'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { hasAstroReleaseConfiguration } from '~~/server/utils/pageStudio/astroBuildHttp'

export default eventHandler(async (event) => {
  const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
  const parsed = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website ID' })
  setHeader(event, 'cache-control', 'private, no-store')
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const state = await readPageStudioLaunchState({ tenantId, siteId: parsed.data, actorId: user.id, env })
  return { ...state, candidateReview: hasAstroReleaseConfiguration(event) && state.content?.requiresSealedFeatures === false }
})
