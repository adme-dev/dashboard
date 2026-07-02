import { queryOne, execute } from '~~/server/utils/db'
import { verifyState, signState } from '~~/server/utils/socialOAuth/state'
import {
  discoverYouTubeChannels,
  exchangeYouTubeCode,
  getYouTubeDiscoveryErrorReason,
  mapYouTubeChannelsToAccountRows
} from '~~/server/utils/socialOAuth/youtube'
import { putPending } from '~~/server/utils/socialOAuth/pending'
import { upsertSocialAccount } from '~~/server/utils/socialOAuth/store'
import {
  buildYouTubeRedirectUri,
  getSocialOauthStateSecret,
  getYouTubeOAuthConfig
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const YOUTUBE_ACCOUNTS_PATH = '/agency/social/publishing/accounts'

function youtubeAccountsPath(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return `${YOUTUBE_ACCOUNTS_PATH}?${params.toString()}`
}

/**
 * GET /api/agency/social/publishing/accounts/callback/youtube?code&state
 * Google redirects here. Verifies state, exchanges the code, discovers YouTube channels,
 * then finalizes one channel inline or stashes multi-channel selection in KV.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const youtubeConfig = getYouTubeOAuthConfig(event)
  const secret = getSocialOauthStateSecret(event)
  const redirectUri = buildYouTubeRedirectUri(event)
  const fail = (reason: string, clientId?: string) => sendRedirect(event, youtubeAccountsPath({
    social_error: reason,
    ...(clientId ? { client: clientId } : {})
  }), 302)

  if (q.error) return fail(String(q.error_description || q.error))
  const state = verifyState<{ clientId: string, userId: string, platform?: string }>(String(q.state || ''), secret, 600_000)
  if (!state || state.platform !== 'youtube') return fail('invalid_state')
  try {
    await requireSocialClientAccess(event, state.clientId)
  } catch {
    return fail('client_access_required', state.clientId)
  }
  if (!q.code) return fail('no_code', state.clientId)
  if (!youtubeConfig.clientId || !youtubeConfig.clientSecret) return fail('youtube_not_configured', state.clientId)

  let accessToken: string
  let refreshToken: string | null = null
  let expiresAt: string | null = null
  try {
    const token = await exchangeYouTubeCode(
      String(q.code),
      youtubeConfig.clientId,
      youtubeConfig.clientSecret,
      redirectUri
    )
    accessToken = token.access_token
    refreshToken = token.refresh_token || null
    expiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString()
  } catch {
    return fail('youtube_token_exchange_failed', state.clientId)
  }

  let channels
  try {
    channels = await discoverYouTubeChannels(accessToken)
  } catch (error) {
    return fail(getYouTubeDiscoveryErrorReason(error), state.clientId)
  }
  if (!channels.length) return fail('no_youtube_channels', state.clientId)

  if (channels.length === 1) {
    const rows = mapYouTubeChannelsToAccountRows(channels, accessToken, refreshToken, expiresAt)
    const res = await upsertSocialAccount({ queryOne, execute }, state.clientId, rows[0]!, state.userId)
    if (res.status === 'conflict') return fail('youtube_channel_owned_by_another_client', state.clientId)
    return sendRedirect(event, youtubeAccountsPath({ social_connected: '1', client: state.clientId }), 302)
  }

  const nonce = crypto.randomUUID()
  const stored = await putPending(event, nonce, {
    clientId: state.clientId,
    userId: state.userId,
    platform: 'youtube',
    expiresAt,
    youtube: {
      accessToken,
      refreshToken,
      channels
    }
  })
  if (!stored) return fail('youtube_selection_unavailable', state.clientId)

  const sel = signState({ nonce, clientId: state.clientId, userId: state.userId }, secret)
  return sendRedirect(event, youtubeAccountsPath({ social_select: sel, client: state.clientId }), 302)
})
