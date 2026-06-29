import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildGoogleBusinessAuthUrl } from '~~/server/utils/socialOAuth/googleBusiness'
import {
  buildGoogleBusinessRedirectUri,
  getGoogleBusinessOAuthConfig,
  getSocialOauthStateSecret,
  isGoogleBusinessPublishingEnabled
} from '~~/server/utils/socialOAuth/env'

/**
 * GET /api/agency/social/publishing/accounts/connect/google-business?clientId=
 * Builds a signed-state Google Business Profile OAuth URL and 302s the operator to Google.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isGoogleBusinessPublishingEnabled(event)) {
    throw createError({ statusCode: 404, statusMessage: 'Google Business connection is disabled' })
  }

  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

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
