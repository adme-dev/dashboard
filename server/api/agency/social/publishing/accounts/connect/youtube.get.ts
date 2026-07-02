import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildYouTubeAuthUrl } from '~~/server/utils/socialOAuth/youtube'
import {
  buildYouTubeRedirectUri,
  getSocialOauthStateSecret,
  getYouTubeOAuthConfig,
  isYouTubeConnectionEnabled
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/accounts/connect/youtube?clientId=
 * Starts YouTube Data API OAuth for channel discovery and future upload publishing.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isYouTubeConnectionEnabled(event)) {
    throw createError({ statusCode: 503, statusMessage: 'YouTube credentials not configured' })
  }

  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  const youtubeConfig = getYouTubeOAuthConfig(event)
  if (!youtubeConfig.clientId || !youtubeConfig.clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'YouTube credentials not configured' })
  }

  const secret = getSocialOauthStateSecret(event)
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'OAuth state secret not configured' })

  const redirectUri = buildYouTubeRedirectUri(event)
  const nonce = crypto.randomUUID()
  const state = signState({ clientId, userId: String(user.id), platform: 'youtube', nonce }, secret)
  return sendRedirect(event, buildYouTubeAuthUrl(youtubeConfig.clientId, redirectUri, state), 302)
})
