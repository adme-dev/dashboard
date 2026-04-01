import { getOrgToken, getActiveOrgToken, getOrgTenant } from '../../utils/tokenStore'

export default eventHandler(async (event) => {
  try {
    let token = await getOrgToken(event)
    let connected = Boolean(token && token.access_token)

    if (connected) {
      try {
        token = await getActiveOrgToken(event, { minTtlMs: 0 })
        connected = Boolean(token && token.access_token)
      } catch {
        connected = false
      }
    }

    const tenant = await getOrgTenant(event)
    return {
      connected,
      selectedTenantId: tenant?.tenantId || null,
      selectedTenantName: tenant?.tenantName || null
    }
  } catch (error: any) {
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { connected: false, selectedTenantId: null }
    }
    console.error('Failed to check Xero status:', error)
    return { connected: false, selectedTenantId: null }
  }
})
