import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteBody } from '~~/server/utils/pageStudio/schemas'
import { createPageStudioSite } from '~~/server/utils/pageStudio/sites'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const parsed = PageStudioSiteBody.safeParse(await readBody(event))
    if (!parsed.success || !parsed.data.clientId) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site' })
    }
    const site = await createPageStudioSite({
      actorId: user.id,
      actorRole: 'agency',
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      route: parsed.data.route,
      starterVersion: parsed.data.starterVersion,
      tenantId
    })
    return { site }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
