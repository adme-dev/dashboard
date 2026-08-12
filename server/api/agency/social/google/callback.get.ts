import { sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import {
  exchangeGoogleCode,
  getGoogleOAuthIdentity,
  GOOGLE_ADS_OAUTH_SCOPES,
  listAccessibleCustomers,
  getCustomerInfo,
  listClientAccounts
} from '~~/server/utils/googleAdsClient'
import {
  consumeGoogleOAuthAttempt,
  storeGoogleCredentialProfile,
  type GoogleDiscoveredAccount,
} from '~~/server/utils/googleCredentialProfiles'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

/**
 * GET /api/agency/social/google/callback
 * OAuth callback — exchanges code for tokens, stores customer accounts.
 * IMPORTANT: Every code path must redirect to /auth/oauth-callback so the
 * popup can communicate the result back to the opener window.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const errorParam = String(query.error || '')
    const attempt = state
      ? await consumeGoogleOAuthAttempt(state, user.id, { purpose: 'google_ads' })
      : null
    if (!attempt) {
      return sendRedirect(event, '/auth/oauth-callback?platform=google&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    // Consume valid attempts even when the operator denied permission, so the
    // state can never be replayed into a later callback.
    if (errorParam) {
      const errorDesc = String(query.error_description || errorParam)
      return sendRedirect(event, `/auth/oauth-callback?platform=google&success=false&error=${encodeURIComponent(errorDesc)}`, 302)
    }
    if (!code) {
      return sendRedirect(event, '/auth/oauth-callback?platform=google&success=false&error=' + encodeURIComponent('Google did not return an authorization code.'), 302)
    }

    const runtimeConfig = useRuntimeConfig()
    const config = resolveGoogleAdsRuntimeConfig(undefined, event)
    const reqUrl = getRequestURL(event)
    const configured = runtimeConfig.googleRedirectUri
    const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
    const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

    // Exchange code for tokens (includes refresh_token because we used prompt=consent)
    const tokens = await exchangeGoogleCode(
      code,
      config.googleClientId,
      config.googleClientSecret,
      redirectUri
    )

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : new Date(Date.now() + 60 * 60 * 1000) // default 1 hour

    const expectedGoogleEmail = String(attempt.context?.expectedGoogleEmail || '').trim().toLowerCase()
    let identityEmail: string | null = null
    try {
      identityEmail = (await getGoogleOAuthIdentity(tokens.access_token)).email
    } catch (error) {
      if (expectedGoogleEmail) throw error
    }
    if (expectedGoogleEmail && identityEmail !== expectedGoogleEmail) {
      throw createError({
        statusCode: 409,
        statusMessage: `Google returned a different Google account. Sign in as ${expectedGoogleEmail}.`
      })
    }

    // List accessible customer accounts
    const customerIds = await listAccessibleCustomers(
      tokens.access_token,
      config.googleDeveloperToken
    )

    // Collect all ad accounts: try each accessible customer as MCC first, then as direct account
    const allAccounts: GoogleDiscoveredAccount[] = []
    const seen = new Set<string>()

    for (const customerId of customerIds) {
      // Try as MCC — list child accounts
      try {
        const children = await listClientAccounts(customerId, tokens.access_token, config.googleDeveloperToken)
        if (children.length > 0) {
          for (const child of children) {
            if (!seen.has(child.customerId)) {
              seen.add(child.customerId)
              allAccounts.push({ ...child, managerCustomerId: customerId })
            }
          }
          continue
        }
      } catch {
        // Not an MCC or no access — try as direct account
      }

      // Try as direct ad account
      try {
        const info = await getCustomerInfo(customerId, tokens.access_token, config.googleDeveloperToken)
        if (info && !seen.has(info.customerId)) {
          seen.add(info.customerId)
          allAccounts.push({ ...info, managerCustomerId: null })
        }
      } catch (err: any) {
        console.error(`[GoogleAds] Failed to get info for customer ${customerId}:`, err.message)
      }
    }

    const { profileId, storedCount } = await storeGoogleCredentialProfile({
      userId: user.id,
      identityEmail,
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : GOOGLE_ADS_OAUTH_SCOPES,
      },
      accessibleCustomerIds: customerIds,
      accounts: allAccounts,
    })

    return sendRedirect(event, `/auth/oauth-callback?platform=google&success=true&accounts=${storedCount}&profile=${profileId}`, 302)
  } catch (err: any) {
    console.error('[Google Callback] Error:', err.message || err)
    const msg = err.statusMessage || err.data?.statusMessage || err.data?.error?.message || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=google&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
