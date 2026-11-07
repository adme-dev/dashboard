import { getRequestURL, setCookie } from 'h3'
import { exchangeXeroCode, fetchXeroTenants } from '~~/server/utils/xeroClient'
import { setOrgToken } from '~~/server/utils/tokenStore'
import { setSelectedTenant } from '~~/server/utils/session'
import { requireAuth, getUserByEmail, createJwt, type User } from '~~/server/utils/auth'
import { assertFinancePermission } from '~~/server/utils/financeAccess'

/**
 * Xero OAuth callback.
 *
 * Two flows land here:
 *   • Settings "Connect/Reconnect Xero" — the request carries an app
 *     session; we bind the org token and bounce back to settings/popup.
 *   • "Sign in with Xero" from the login page — no app session. We match
 *     the Xero identity (id_token email, received directly from Xero's
 *     token endpoint) to an ACTIVE team member and mint the same session
 *     cookies as the magic-link callback. Only a current explicit Finance
 *     grant also refreshes the organisation's accounting connection; other
 *     recognised staff sign in using Xero identity only.
 *
 * If neither an app session nor a recognised team member is present, the
 * org connection is NOT written — an unknown Xero user must not be able
 * to bind/replace the organisation's accounting connection.
 */

function decodeIdTokenEmail(idToken?: string): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded))
    return typeof claims?.email === 'string' ? claims.email.toLowerCase() : null
  } catch {
    return null
  }
}

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

  // Who is authorising this connection?
  let sessionUser: User | null
  try {
    sessionUser = await requireAuth(event)
  } catch {
    sessionUser = null
  }

  let matchedUser: User | null = null
  if (!sessionUser) {
    const email = decodeIdTokenEmail(tokenSet.id_token)
    const candidate = email ? await getUserByEmail(email) : null
    if (candidate?.is_active) matchedUser = candidate
  }

  if (!sessionUser && !matchedUser) {
    // Unknown identity — refuse to bind the org connection.
    return sendRedirect(event, '/auth/xeroflow?error=xero-not-recognised', 302)
  }

  // Identity recognition does not grant accounting access. An unavailable
  // permission lookup must fail before any app session or financial state write.
  let hasFinancePermission = true
  try {
    await assertFinancePermission(event, (sessionUser ?? matchedUser)!.id, true)
  } catch (error) {
    // A recognised login may remain identity-only. Existing-session connection
    // attempts and infrastructure failures retain the explicit denial.
    if (sessionUser || (error as { statusCode?: number }).statusCode !== 403) throw error
    hasFinancePermission = false
  }

  let tenants: Array<{ tenantId: string, tenantName: string }> = []
  if (hasFinancePermission) {
    try {
      tenants = await fetchXeroTenants(tokenSet.access_token!)
    } catch {
      // Non-fatal for explicitly authorised connections.
    }

    const onlyTenant = tenants.length === 1 ? tenants[0] : undefined
    if (onlyTenant) {
      await setOrgToken(event, tokenSet, {
        tenantId: onlyTenant.tenantId,
        tenantName: onlyTenant.tenantName,
        connectedBy: (sessionUser ?? matchedUser)?.email
      })
      await setSelectedTenant(event, onlyTenant.tenantId, onlyTenant.tenantName)
    } else {
      await setOrgToken(event, tokenSet)
    }
  }

  // "Sign in with Xero" — mint the same session cookies as the magic-link
  // callback so one consent covers login + connection.
  if (!sessionUser && matchedUser) {
    const jwtToken = await createJwt({
      userId: matchedUser.id,
      email: matchedUser.email,
      role: matchedUser.role
    })
    const isSecure = getRequestURL(event).protocol === 'https:'
    const cookieOpts = {
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    }
    setCookie(event, 'auth_token', jwtToken, { ...cookieOpts, httpOnly: true })
    setCookie(event, 'auth_status', 'logged_in', { ...cookieOpts, httpOnly: false })
    setCookie(event, 'auth_token_client', jwtToken, { ...cookieOpts, httpOnly: false })
  }

  // Multi-tenant orgs must land on /settings to pick a tenant — /agency
  // would leave every Xero endpoint erroring on "no organization selected".
  const dest = !hasFinancePermission
    ? '/agency'
    : mode === 'popup'
      ? '/xero-popup-close'
      : (sessionUser || tenants.length !== 1) ? '/settings' : '/agency'
  return sendRedirect(event, dest, 302)
})
