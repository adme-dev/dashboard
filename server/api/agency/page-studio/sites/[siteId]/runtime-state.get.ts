import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioRuntimeState } from '~~/server/utils/pageStudio/runtimeState'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'
import { resolveAgencyPageStudioSiteClient } from '~~/server/utils/pageStudio/versions'

export default eventHandler(async (event) => {
  const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
  const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
  if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website ID' })
  setHeader(event, 'cache-control', 'private, no-store')
  const clientId = await resolveAgencyPageStudioSiteClient(tenantId, siteId.data)
  return await readPageStudioRuntimeState({ tenantId, clientId, siteId: siteId.data }, event.context.cloudflare?.env as Record<string, unknown> | undefined)
})
