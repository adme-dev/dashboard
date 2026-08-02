import { queryOne, execute } from '~~/server/utils/db'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import {
  discoverTikTokCreator,
  exchangeTikTokContentCode,
  getTikTokContentDiscoveryErrorReason,
  mapTikTokCreatorToAccountRow
} from '~~/server/utils/socialOAuth/tiktok'
import { upsertSocialAccount } from '~~/server/utils/socialOAuth/store'
import {
  buildTikTokContentRedirectUri,
  getSocialOauthStateSecret,
  getTikTokContentOAuthConfig
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { logOAuthFailure } from '~~/server/utils/socialOAuth/diagnostics'

const TIKTOK_ACCOUNTS_PATH = '/agency/social/publishing/accounts'

function tikTokAccountsPath(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return `${TIKTOK_ACCOUNTS_PATH}?${params.toString()}`
}

/**
 * GET /api/agency/social/publishing/accounts/callback/tiktok?code&state
 * TikTok redirects here. Verifies state, exchanges the code, discovers the creator,
 * then stores the creator account without enabling live TikTok publishing.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const tiktokConfig = getTikTokContentOAuthConfig(event)
  const secret = getSocialOauthStateSecret(event)
  const redirectUri = buildTikTokContentRedirectUri(event)
  const fail = (reason: string, clientId?: string) => sendRedirect(event, tikTokAccountsPath({
    social_error: reason,
    ...(clientId ? { client: clientId } : {})
  }), 302)

  if (q.error) return fail(String(q.error_description || q.error))
  const state = verifyState<{ clientId: string, userId: string, platform?: string }>(String(q.state || ''), secret, 600_000)
  if (!state || state.platform !== 'tiktok') return fail('invalid_state')
  try {
    await requireSocialClientAccess(event, state.clientId)
  } catch (err) {
    logOAuthFailure('tiktok', 'client_access_required', err, state.clientId)
    return fail('client_access_required', state.clientId)
  }
  if (!q.code) return fail('no_code', state.clientId)
  if (!tiktokConfig.clientKey || !tiktokConfig.clientSecret) return fail('tiktok_not_configured', state.clientId)

  let accessToken: string
  let refreshToken: string | null = null
  let expiresAt: string | null = null
  try {
    const token = await exchangeTikTokContentCode(
      String(q.code),
      tiktokConfig.clientKey,
      tiktokConfig.clientSecret,
      redirectUri
    )
    accessToken = token.access_token
    refreshToken = token.refresh_token || null
    expiresAt = new Date(Date.now() + (token.expires_in || 86_400) * 1000).toISOString()
  } catch (err) {
    logOAuthFailure('tiktok', 'tiktok_token_exchange_failed', err, state.clientId)
    return fail('tiktok_token_exchange_failed', state.clientId)
  }

  let creator
  try {
    creator = await discoverTikTokCreator(accessToken)
  } catch (error) {
    return fail(getTikTokContentDiscoveryErrorReason(error), state.clientId)
  }

  const row = mapTikTokCreatorToAccountRow(creator, accessToken, refreshToken, expiresAt)
  const res = await upsertSocialAccount({ queryOne, execute }, state.clientId, row, state.userId)
  if (res.status === 'conflict') return fail('tiktok_creator_owned_by_another_client', state.clientId)

  return sendRedirect(event, tikTokAccountsPath({ social_connected: '1', client: state.clientId }), 302)
})
