import { queryOne, execute } from '~~/server/utils/db'
import { verifyState, signState } from '~~/server/utils/socialOAuth/state'
import {
  discoverGoogleBusinessLocations,
  exchangeGoogleBusinessCode,
  getGoogleBusinessDiscoveryErrorReason,
  mapGoogleBusinessLocationsToAccountRows
} from '~~/server/utils/socialOAuth/googleBusiness'
import { putPending } from '~~/server/utils/socialOAuth/pending'
import { upsertSocialAccount } from '~~/server/utils/socialOAuth/store'
import {
  buildGoogleBusinessRedirectUri,
  getGoogleBusinessOAuthConfig,
  getSocialOauthStateSecret
} from '~~/server/utils/socialOAuth/env'

const GOOGLE_BUSINESS_SETTINGS_PATH = '/agency/social/inbox/settings'

function googleBusinessSettingsPath(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return `${GOOGLE_BUSINESS_SETTINGS_PATH}?${params.toString()}`
}

/**
 * GET /api/agency/social/publishing/accounts/callback/google-business?code&state
 * Google redirects here. Verifies state, exchanges the code, discovers GBP locations,
 * then finalizes one location inline or stashes multi-location selection in KV.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const googleConfig = getGoogleBusinessOAuthConfig(event)
  const secret = getSocialOauthStateSecret(event)
  const redirectUri = buildGoogleBusinessRedirectUri(event)
  const fail = (reason: string, clientId?: string) => sendRedirect(event, googleBusinessSettingsPath({
    social_error: reason,
    ...(clientId ? { client: clientId } : {})
  }), 302)

  if (q.error) return fail(String(q.error_description || q.error))
  const state = verifyState<{ clientId: string, userId: string, platform?: string }>(String(q.state || ''), secret, 600_000)
  if (!state || state.platform !== 'google-business') return fail('invalid_state')
  if (!q.code) return fail('no_code', state.clientId)
  if (!googleConfig.clientId || !googleConfig.clientSecret) return fail('google_business_not_configured', state.clientId)

  let accessToken: string
  let refreshToken: string | null = null
  let expiresAt: string | null = null
  try {
    const token = await exchangeGoogleBusinessCode(
      String(q.code),
      googleConfig.clientId,
      googleConfig.clientSecret,
      redirectUri
    )
    accessToken = token.access_token
    refreshToken = token.refresh_token || null
    expiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString()
  } catch {
    return fail('token_exchange_failed', state.clientId)
  }

  let locations
  try {
    locations = await discoverGoogleBusinessLocations(accessToken)
  } catch (error) {
    return fail(getGoogleBusinessDiscoveryErrorReason(error), state.clientId)
  }
  if (!locations.length) return fail('no_locations', state.clientId)

  if (locations.length === 1) {
    const rows = mapGoogleBusinessLocationsToAccountRows(locations, accessToken, refreshToken, expiresAt)
    const res = await upsertSocialAccount({ queryOne, execute }, state.clientId, rows[0]!, state.userId)
    if (res.status === 'conflict') return fail('location_owned_by_another_client', state.clientId)
    return sendRedirect(event, googleBusinessSettingsPath({ social_connected: '1', client: state.clientId }), 302)
  }

  const nonce = crypto.randomUUID()
  const stored = await putPending(event, nonce, {
    clientId: state.clientId,
    userId: state.userId,
    platform: 'google-business',
    expiresAt,
    googleBusiness: {
      accessToken,
      refreshToken,
      locations
    }
  })
  if (!stored) return fail('selection_unavailable', state.clientId)

  const sel = signState({ nonce, clientId: state.clientId, userId: state.userId }, secret)
  return sendRedirect(event, googleBusinessSettingsPath({ social_select: sel, client: state.clientId }), 302)
})
