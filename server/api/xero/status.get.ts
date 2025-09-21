import { getActiveTokenForSession, getTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

export default eventHandler(async (event) => {
  let token = await getTokenForSession(event)
  let connected = Boolean(token && token.access_token)

  if (connected) {
    try {
      token = await getActiveTokenForSession(event, { minTtlMs: 0 })
      connected = Boolean(token && token.access_token)
    } catch {
      connected = false
    }
  }
  const selectedTenantId = getSelectedTenant(event)
  return {
    connected,
    selectedTenantId
  }
})
