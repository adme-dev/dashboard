import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildGoogleBusinessAuthUrl } from '~~/server/utils/socialOAuth/googleBusiness'
import {
  buildGoogleBusinessRedirectUri,
  getGoogleBusinessOAuthConfig,
  getSocialOauthStateSecret,
  isGoogleBusinessConnectionEnabled
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/accounts/connect/google-business?clientId=
 * Builds a signed-state Google Business Profile OAuth URL and 302s the operator to Google.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isGoogleBusinessConnectionEnabled(event)) {
    throw createError({ statusCode: 503, statusMessage: 'Google Business credentials not configured' })
  }

  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  const googleConfig = getGoogleBusinessOAuthConfig(event)
  if (!googleConfig.clientId || !googleConfig.clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Google Business credentials not configured' })
  }

  const secret = getSocialOauthStateSecret(event)
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'OAuth state secret not configured' })

  const redirectUri = buildGoogleBusinessRedirectUri(event)

  const nonce = crypto.randomUUID()
  const state = signState({ clientId, userId: String(user.id), platform: 'google-business', nonce }, secret)
  return sendRedirect(event, buildGoogleBusinessAuthUrl(googleConfig.clientId, redirectUri, state), 302)
})
