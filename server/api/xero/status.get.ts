import { getActiveTokenForSession, getTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

export default eventHandler(async (event) => {
  try {
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
  } catch (error: any) {
    // If xero_sessions table doesn't exist, Xero is not configured
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { connected: false, selectedTenantId: null }
    }
    console.error('Failed to check Xero status:', error)
    return { connected: false, selectedTenantId: null }
  }
})
