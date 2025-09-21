import { getTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

export default eventHandler(async (event) => {
  const token = await getTokenForSession(event)
  const connected = Boolean(token && token.access_token && token.expires_at > Date.now())
  const selectedTenantId = getSelectedTenant(event)
  return {
    connected,
    selectedTenantId
  }
})
