import { exchangeXeroCode, fetchXeroTenants } from '~~/server/utils/xeroClient'
import { setOrgToken, setOrgTenant } from '~~/server/utils/tokenStore'
import { setSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code || '')
  const state = String(query.state || '')
  const expectedState = getCookie(event, 'xero_oauth_state')

  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth state or code' })
  }

  deleteCookie(event, 'xero_oauth_state', { path: '/' })
  const mode = getCookie(event, 'xero_oauth_mode')
  if (mode) {
    deleteCookie(event, 'xero_oauth_mode', { path: '/' })
  }

  const tokenSet = await exchangeXeroCode({ code, event })

  // Fetch tenants and store at org level
  let tenants: Array<{ tenantId: string; tenantName: string }> = []
  try {
    tenants = await fetchXeroTenants(tokenSet.access_token)
  } catch {
    // Non-fatal
  }

  if (tenants.length === 1) {
    // Auto-select the only tenant
    await setOrgToken(event, tokenSet, {
      tenantId: tenants[0].tenantId,
      tenantName: tenants[0].tenantName
    })
    await setSelectedTenant(event, tenants[0].tenantId, tenants[0].tenantName)
  } else {
    // Store token, user will select tenant on settings page
    await setOrgToken(event, tokenSet)
  }

  return sendRedirect(event, mode === 'popup' ? '/xero-popup-close' : '/settings', 302)
})
