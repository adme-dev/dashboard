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
import { defineEventHandler, getQuery, sendRedirect, createError } from 'h3'
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

  // Consent is the ONLY way scope is granted, and it is NOT forgeable via query params. We mint two
  // short-lived, scope-BOUND assertions (the granted scope is signed INTO each via HMAC) and embed one
  // behind each consent button — the read-only button carries an mcp:read assertion, the read+write button
  // an mcp:read+mcp:write one. The user's click selects which scoped assertion is handed to the Worker.
  // A crafted link can neither skip this screen nor pre-elevate to mcp:write: it cannot forge an assertion,
  // and scope is never derived from a raw `write`/`consent` query param. (Closes the self-elevation defect.)
  const ttlSec = 300
  const [readAssertion, writeAssertion] = await Promise.all([
    signMcpAssertion(user.id, secret, { scope: ['mcp:read'], ttlSec }),
    signMcpAssertion(user.id, secret, { scope: ['mcp:read', 'mcp:write'], ttlSec }),
  ])
  const allowUrl = new URL(dest)
  allowUrl.searchParams.set('state', state)
  allowUrl.searchParams.set('assertion', readAssertion)
  const allowWriteUrl = new URL(dest)
  allowWriteUrl.searchParams.set('state', state)
  allowWriteUrl.searchParams.set('assertion', writeAssertion)
  const cancelUrl = new URL(dest)
  cancelUrl.searchParams.set('state', state)
  cancelUrl.searchParams.set('error', 'access_denied')
  return buildConsentHtml({
    userName: user.name || user.email || 'your account',
    allowUrl: allowUrl.toString(),
    allowWriteUrl: allowWriteUrl.toString(),
    cancelUrl: cancelUrl.toString(),
  })
})
