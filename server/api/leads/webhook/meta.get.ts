// GET /api/leads/webhook/meta
//
// Meta verify-token handshake. When connecting a Meta lead-form webhook in
// Meta Business Suite, Meta sends a GET with hub.mode=subscribe, hub.challenge,
// hub.verify_token. We must echo back the challenge as the response body if
// the token matches META_LEADGEN_VERIFY_TOKEN. Anything else returns 403.
//
// This route is intentionally exempt from the auth middleware via
// publicRoutes ('/api/leads/webhook/'). Authentication is solely via the
// shared verify token.

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const mode = String(q['hub.mode'] ?? '')
  const challenge = String(q['hub.challenge'] ?? '')
  const verifyToken = String(q['hub.verify_token'] ?? '')

  const expected =
    process.env.META_LEADGEN_VERIFY_TOKEN ||
    (event.context as any).cloudflare?.env?.META_LEADGEN_VERIFY_TOKEN ||
    ''

  if (!expected) {
    // Misconfigured environment — fail loud to surface in the dashboard
    // rather than silently accepting any token.
    throw createError({ statusCode: 500, statusMessage: 'verify_token_not_configured' })
  }

  if (mode === 'subscribe' && verifyToken === expected) {
    setResponseHeader(event, 'Content-Type', 'text/plain')
    return challenge
  }
  throw createError({ statusCode: 403, statusMessage: 'invalid_verify_token' })
})
