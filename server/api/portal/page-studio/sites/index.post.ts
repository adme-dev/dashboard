import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteBody } from '~~/server/utils/pageStudio/schemas'
import {
  createPageStudioSite,
  resolvePortalPageStudioTenant
} from '~~/server/utils/pageStudio/sites'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) {
      throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    }
    const parsed = PageStudioSiteBody.omit({ clientId: true }).safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site' })
    }
    const tenantId = await resolvePortalPageStudioTenant(user.clientId)
    const setupProposal = createPageStudioSetupProposal({
      businessName: parsed.data.name,
      starterVersion: parsed.data.starterVersion,
      setupSource: parsed.data.setupSource,
      setupBrief: parsed.data.setupBrief
    })
    const site = await createPageStudioSite({
      actorId: user.id,
      actorRole: 'client',
      clientId: user.clientId,
      name: parsed.data.name,
      portalUserId: user.id,
      route: parsed.data.route,
      starterVersion: parsed.data.starterVersion,
      setupSource: parsed.data.setupSource,
      setupBrief: parsed.data.setupBrief,
      setupProposal: {
        source: parsed.data.setupSource,
        brief: parsed.data.setupBrief,
        plan: setupProposal
      },
      tenantId
    })
    return { site }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
