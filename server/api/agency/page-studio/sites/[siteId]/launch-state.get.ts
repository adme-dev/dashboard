import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioLaunchState } from '~~/server/utils/pageStudio/launchState'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import type { PageStudioCheckpointBucket } from '~~/server/utils/pageStudio/releaseCheckpoint'

export default eventHandler(async (event) => {
  const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
  const parsed = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website ID' })
  setHeader(event, 'cache-control', 'private, no-store')
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  return readPageStudioLaunchState({ tenantId, siteId: parsed.data, bucket: env?.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket | undefined })
})
