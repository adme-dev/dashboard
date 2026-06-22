// server/api/mcp/authorize.get.ts
// MCP Server Phase 1 — the "reuse app identity" point (mcp-server-phase1 spec §3, TODO A). The MCP Worker
// redirects the browser here to authenticate the user against XeroFlow's OWN login. If logged in, we mint a
// short-lived HMAC assertion of their userId and redirect back to the Worker's callback; if not, we bounce
// to sign-in and return here. So the MCP user == the in-app user, with no separate identity store.
//
// Open-redirect guard: redirect_uri must match MCP_WORKER_ORIGIN (never hand a valid assertion to an
// arbitrary host). HARD-gated by MCP_SERVER_ENABLED.
//
// Consent is explicit: an unconsented request renders the consent screen (read-only vs read+write); the
// chosen scope (mcp:read, optionally mcp:write) is signed INTO the assertion so the Worker mints exactly it.
import { defineEventHandler, getQuery, sendRedirect, getRequestURL, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { signMcpAssertion } from '~~/server/utils/ai/mcp/assertion'
import { buildConsentHtml } from '~~/server/utils/ai/mcp/consent'

export default defineEventHandler(async (event) => {
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }

  const query = getQuery(event)
  const redirectUri = String(query.redirect_uri || '')
  const state = String(query.state || '')
  if (!redirectUri) throw createError({ statusCode: 400, statusMessage: 'redirect_uri required' })

  // Authenticate against the app's existing session. Not logged in → sign-in, then back here.
  let user
  try {
    user = await requireAuth(event)
  } catch {
    return sendRedirect(event, `/sign-in?redirect=${encodeURIComponent(event.path)}`, 302)
  }

  const secret = process.env.MCP_HANDSHAKE_SECRET
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'MCP_HANDSHAKE_SECRET not configured' })

  // Open-redirect guard: only ever redirect back to our own MCP Worker.
  let dest: URL
  try {
    dest = new URL(redirectUri)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid redirect_uri' })
  }
  const allowedOrigin = process.env.MCP_WORKER_ORIGIN
  if (!allowedOrigin || dest.origin !== allowedOrigin) {
    throw createError({ statusCode: 400, statusMessage: 'redirect_uri not allowed' })
  }

  // Explicit consent: until the user clicks Allow, render the consent screen. Allow re-enters this
  // endpoint with consent=granted (params preserved); the read+write button also sets write=granted.
  // Cancel bounces back with OAuth error=access_denied.
  if (String(query.consent || '') !== 'granted') {
    const self = getRequestURL(event)
    const allowUrl = new URL(self)
    allowUrl.searchParams.set('consent', 'granted')
    const allowWriteUrl = new URL(self)
    allowWriteUrl.searchParams.set('consent', 'granted')
    allowWriteUrl.searchParams.set('write', 'granted')
    const cancelUrl = new URL(dest)
    cancelUrl.searchParams.set('state', state)
    cancelUrl.searchParams.set('error', 'access_denied')
    return buildConsentHtml({
      userName: user.name || user.email || 'your account',
      allowUrl: allowUrl.toString(),
      allowWriteUrl: allowWriteUrl.toString(),
      cancelUrl: cancelUrl.toString(),
    })
  }

  // The consented scope: read-only by default; the read+write button adds mcp:write. The granted scope is
  // signed into the assertion (integrity-protected) so the Worker mints the OAuth token with exactly this.
  const scope = String(query.write || '') === 'granted' ? ['mcp:read', 'mcp:write'] : ['mcp:read']
  const assertion = await signMcpAssertion(user.id, secret, { scope })
  dest.searchParams.set('state', state)
  dest.searchParams.set('assertion', assertion)
  return sendRedirect(event, dest.toString(), 302)
})
