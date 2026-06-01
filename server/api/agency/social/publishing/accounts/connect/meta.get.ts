import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildMetaAuthUrl, isSocialDmEnabled } from '~~/server/utils/socialOAuth/meta'

/**
 * GET /api/agency/social/publishing/accounts/connect/meta?clientId=
 * Builds a signed-state Meta OAuth URL and 302s the operator to Facebook.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const appId = process.env.META_APP_ID
  if (!appId) throw createError({ statusCode: 503, statusMessage: 'Meta app not configured' })

  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'OAuth state secret not configured' })

  const base = process.env.SOCIAL_OAUTH_REDIRECT_BASE || getRequestURL(event).origin
  const redirectUri = `${base}/api/agency/social/publishing/accounts/callback/meta`

  const nonce = crypto.randomUUID()
  const state = signState({ clientId, userId: String(user.id), platform: 'meta', nonce }, secret)
  // Messaging scopes are only requested once the App-Review-gated DM channels are enabled —
  // adding them pre-approval would break the live consent dialog that publishing/comments use.
  return sendRedirect(event, buildMetaAuthUrl(appId, redirectUri, state, isSocialDmEnabled()), 302)
})
