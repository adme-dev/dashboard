import { requireClientAuth } from '~~/server/utils/clientAuth'
import { isSearchAuthorityEnabled } from '~~/server/utils/searchAuthority/feature'

export default eventHandler(async (event) => {
  const user = await requireClientAuth(event)
  return {
    available: Boolean(
      user.permissions.canViewAnalytics
      && await isSearchAuthorityEnabled(user.clientId)
    )
  }
})
