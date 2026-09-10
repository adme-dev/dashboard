import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { grantPageStudioEntitlement } from '~~/server/utils/pageStudio/entitlementGrants'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

export default eventHandler(async (event) => {
  try {
    const { user, tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_SUBSCRIPTIONS')
    return await grantPageStudioEntitlement({ actorId: user.id, tenantId, body: await readBody(event) })
  } catch (error) {
    pageStudioHttpError(error)
  }
})
