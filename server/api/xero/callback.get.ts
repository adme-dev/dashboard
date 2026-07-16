import { getRequestURL, setCookie } from 'h3'
import { exchangeXeroCode, fetchXeroTenants } from '~~/server/utils/xeroClient'
import { setOrgToken, setOrgTenant } from '~~/server/utils/tokenStore'
import { setSelectedTenant } from '~~/server/utils/session'
import { requireAuth, getUserByEmail, createJwt, type User } from '~~/server/utils/auth'

/**
 * Xero OAuth callback.
 *
 * Two flows land here:
 *   • Settings "Connect/Reconnect Xero" — the request carries an app
 *     session; we bind the org token and bounce back to settings/popup.
 *   • "Sign in with Xero" from the login page — no app session. We match
 *     the Xero identity (id_token email, received directly from Xero's
 *     token endpoint) to an ACTIVE team member and mint the same session
 *     cookies as the magic-link callback, so one consent both signs the
 *     user in and keeps the org connection fresh. Previously this flow
 *     stored the org token but created no session — users faced a second
 *     login AND a second consent via settings.
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
  let sessionUser: User | null = null
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
      tenantName: tenants[0].tenantName,
      connectedBy: (sessionUser ?? matchedUser)?.email,
    })
    await setSelectedTenant(event, tenants[0].tenantId, tenants[0].tenantName)
  } else {
    // Store token, user will select tenant on settings page
    await setOrgToken(event, tokenSet)
  }

  // "Sign in with Xero" — mint the same session cookies as the magic-link
  // callback so one consent covers login + connection.
  if (!sessionUser && matchedUser) {
    const jwtToken = await createJwt({
      userId: matchedUser.id,
      email: matchedUser.email,
      role: matchedUser.role,
    })
    const isSecure = getRequestURL(event).protocol === 'https:'
    const cookieOpts = {
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    }
    setCookie(event, 'auth_token', jwtToken, { ...cookieOpts, httpOnly: true })
    setCookie(event, 'auth_status', 'logged_in', { ...cookieOpts, httpOnly: false })
    setCookie(event, 'auth_token_client', jwtToken, { ...cookieOpts, httpOnly: false })
  }

  const dest = mode === 'popup'
    ? '/xero-popup-close'
    : sessionUser ? '/settings' : '/agency'
  return sendRedirect(event, dest, 302)
})
