import { queryOne, execute } from '~~/server/utils/db'
import { verifyState, signState } from '~~/server/utils/socialOAuth/state'
import {
  discoverLinkedInOrganizations,
  exchangeLinkedInOrganicCode,
  getLinkedInDiscoveryErrorReason,
  mapLinkedInOrganizationsToAccountRows
} from '~~/server/utils/socialOAuth/linkedin'
import { putPending } from '~~/server/utils/socialOAuth/pending'
import { upsertSocialAccount } from '~~/server/utils/socialOAuth/store'
import {
  buildLinkedInOrganicRedirectUri,
  getLinkedInOrganicOAuthConfig,
  getSocialOauthStateSecret
} from '~~/server/utils/socialOAuth/env'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { logOAuthFailure } from '~~/server/utils/socialOAuth/diagnostics'

const LINKEDIN_ACCOUNTS_PATH = '/agency/social/publishing/accounts'

function linkedInAccountsPath(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return `${LINKEDIN_ACCOUNTS_PATH}?${params.toString()}`
}

/**
 * GET /api/agency/social/publishing/accounts/callback/linkedin?code&state
 * LinkedIn redirects here. Verifies state, exchanges the code, discovers administered
 * organizations, then finalizes one organization inline or stashes multi-org selection in KV.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const linkedinConfig = getLinkedInOrganicOAuthConfig(event)
  const secret = getSocialOauthStateSecret(event)
  const redirectUri = buildLinkedInOrganicRedirectUri(event)
  const fail = (reason: string, clientId?: string) => sendRedirect(event, linkedInAccountsPath({
    social_error: reason,
    ...(clientId ? { client: clientId } : {})
  }), 302)

  if (q.error) return fail(String(q.error_description || q.error))
  const state = verifyState<{ clientId: string, userId: string, platform?: string }>(String(q.state || ''), secret, 600_000)
  if (!state || state.platform !== 'linkedin') return fail('invalid_state')
  try {
    await requireSocialClientAccess(event, state.clientId)
  } catch (err) {
    logOAuthFailure('linkedin', 'client_access_required', err, state.clientId)
    return fail('client_access_required', state.clientId)
  }
  if (!q.code) return fail('no_code', state.clientId)
  if (!linkedinConfig.clientId || !linkedinConfig.clientSecret) return fail('linkedin_not_configured', state.clientId)

  let accessToken: string
  let refreshToken: string | null = null
  let expiresAt: string | null = null
  try {
    const token = await exchangeLinkedInOrganicCode(
      String(q.code),
      linkedinConfig.clientId,
      linkedinConfig.clientSecret,
      redirectUri
    )
    accessToken = token.access_token
    refreshToken = token.refresh_token || null
    expiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString()
  } catch (err) {
    logOAuthFailure('linkedin', 'linkedin_token_exchange_failed', err, state.clientId)
    return fail('linkedin_token_exchange_failed', state.clientId)
  }

  let organizations
  try {
    organizations = await discoverLinkedInOrganizations(accessToken)
  } catch (error) {
    return fail(getLinkedInDiscoveryErrorReason(error), state.clientId)
  }
  if (!organizations.length) return fail('no_linkedin_organizations', state.clientId)

  if (organizations.length === 1) {
    const rows = mapLinkedInOrganizationsToAccountRows(organizations, accessToken, refreshToken, expiresAt)
    const res = await upsertSocialAccount({ queryOne, execute }, state.clientId, rows[0]!, state.userId)
    if (res.status === 'conflict') return fail('linkedin_organization_owned_by_another_client', state.clientId)
    return sendRedirect(event, linkedInAccountsPath({ social_connected: '1', client: state.clientId }), 302)
  }

  const nonce = crypto.randomUUID()
  const stored = await putPending(event, nonce, {
    clientId: state.clientId,
    userId: state.userId,
    platform: 'linkedin',
    expiresAt,
    linkedin: {
      accessToken,
      refreshToken,
      organizations
    }
  })
  if (!stored) return fail('linkedin_selection_unavailable', state.clientId)

  const sel = signState({ nonce, clientId: state.clientId, userId: state.userId }, secret)
  return sendRedirect(event, linkedInAccountsPath({ social_select: sel, client: state.clientId }), 302)
})
