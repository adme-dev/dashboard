import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildTikTokContentAuthUrl } from '~~/server/utils/socialOAuth/tiktok'
import {
  buildTikTokContentRedirectUri,
  getSocialOauthStateSecret,
  getTikTokContentOAuthConfig,
  isTikTokContentConnectionEnabled
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/accounts/connect/tiktok?clientId=
 * Starts TikTok Login Kit OAuth for Content Posting creator discovery.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isTikTokContentConnectionEnabled(event)) {
    throw createError({ statusCode: 503, statusMessage: 'TikTok credentials not configured' })
  }

  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  const tiktokConfig = getTikTokContentOAuthConfig(event)
  if (!tiktokConfig.clientKey || !tiktokConfig.clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'TikTok credentials not configured' })
  }

  const secret = getSocialOauthStateSecret(event)
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'OAuth state secret not configured' })

  const redirectUri = buildTikTokContentRedirectUri(event)
  const nonce = crypto.randomUUID()
  const state = signState({ clientId, userId: String(user.id), platform: 'tiktok', nonce }, secret)
  return sendRedirect(event, buildTikTokContentAuthUrl(tiktokConfig.clientKey, redirectUri, state), 302)
})
