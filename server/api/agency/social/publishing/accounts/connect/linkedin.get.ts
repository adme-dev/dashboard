import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildLinkedInOrganicAuthUrl } from '~~/server/utils/socialOAuth/linkedin'
import {
  buildLinkedInOrganicRedirectUri,
  getLinkedInOrganicOAuthConfig,
  getSocialOauthStateSecret,
  isLinkedInOrganicConnectionEnabled
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/accounts/connect/linkedin?clientId=
 * Starts LinkedIn organic OAuth for organization discovery and future Page publishing.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isLinkedInOrganicConnectionEnabled(event)) {
    throw createError({ statusCode: 503, statusMessage: 'LinkedIn credentials not configured' })
  }

  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  const linkedinConfig = getLinkedInOrganicOAuthConfig(event)
  if (!linkedinConfig.clientId || !linkedinConfig.clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'LinkedIn credentials not configured' })
  }

  const secret = getSocialOauthStateSecret(event)
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'OAuth state secret not configured' })

  const redirectUri = buildLinkedInOrganicRedirectUri(event)
  const nonce = crypto.randomUUID()
  const state = signState({ clientId, userId: String(user.id), platform: 'linkedin', nonce }, secret)
  return sendRedirect(event, buildLinkedInOrganicAuthUrl(linkedinConfig.clientId, redirectUri, state), 302)
})
