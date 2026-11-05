import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { increasePageStudioManualCapacity } from '~~/server/utils/pageStudio/entitlementCapacity'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

export default eventHandler(async (event) => {
  try {
    const { user, tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_SUBSCRIPTIONS')
    return await increasePageStudioManualCapacity({
      actorId: user.id, tenantId,
      entitlementId: getRouterParam(event, 'entitlementId') ?? '',
      body: await readBody(event)
    })
  } catch (error) {
    pageStudioHttpError(error)
  }
})
