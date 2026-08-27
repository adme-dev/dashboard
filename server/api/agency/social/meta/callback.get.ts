import { getCookie, deleteCookie, sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeMetaCode,
  exchangeForLongLivedToken,
} from '~~/server/utils/metaClient'
import { normalizeMetaOAuthIntent } from '~~/server/utils/metaPermissions'
import { getEffectiveMetaPermissionEvidence } from '~~/server/utils/metaPermissionEvidence'
import { buildMetaOAuthRedirectUri, resolveMetaOAuthRuntimeConfig } from '~~/server/utils/metaOAuthRuntimeConfig'
import { debugMetaAccessToken, getMetaGranularTargetIds } from '~~/server/utils/metaTokenDebug'

function safeMetaCallbackMessage(value: unknown): string {
  if (typeof value !== 'string') return 'Connection failed'
  return value
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/access_token\s*[=:]\s*[^\s&,]+/gi, 'access_token=[redacted]')
    .replace(/bearer\s+[^\s,]+/gi, 'Bearer [redacted]')
    .slice(0, 500)
    .trim() || 'Connection failed'
}

/**
 * GET /api/agency/social/meta/callback
 * OAuth callback — exchanges code for long-lived token, stores ad accounts.
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
    const expectedState = getCookie(event, 'meta_oauth_state')
    const intent = normalizeMetaOAuthIntent(getCookie(event, 'meta_oauth_intent'))

    // User denied permission or Meta returned an error
    if (errorParam) {
      const errorReason = safeMetaCallbackMessage(String(query.error_reason || query.error_description || errorParam))
      return sendRedirect(event, `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent(errorReason)}`, 302)
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=meta&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'meta_oauth_state', { path: '/' })
    deleteCookie(event, 'meta_oauth_intent', { path: '/' })

    const config = resolveMetaOAuthRuntimeConfig(event)
    if (!config.metaAppId || !config.metaAppSecret) {
      throw createError({ statusCode: 500, statusMessage: 'Meta app credentials not configured' })
    }
    const redirectUri = buildMetaOAuthRedirectUri(event, config.metaRedirectUri)

    // Exchange code for short-lived token
    const shortToken = await exchangeMetaCode(
      code,
      config.metaAppId,
      config.metaAppSecret,
      redirectUri
    )

    // Facebook Login for Business returns the token bound to config_id. A
    // second legacy exchange strips that Business configuration context, so
    // catalog intent retains the configured token returned by the code
    // exchange. Baseline Marketing API connections keep their existing
    // long-lived exchange.
    const activeToken = intent === 'catalog'
      ? shortToken
      : await exchangeForLongLivedToken(
          shortToken.access_token,
          config.metaAppId,
          config.metaAppSecret,
        )

    const expiresAt = activeToken.expires_in
      ? new Date(Date.now() + activeToken.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // default 60 days

    let businessTargetIds: string[] = []
    try {
      const debugData = await debugMetaAccessToken(
        activeToken.access_token,
        config.metaAppId,
        config.metaAppSecret,
      )
      businessTargetIds = getMetaGranularTargetIds(debugData, 'business_management')
    } catch {
      // Protected API probes remain authoritative if token debugging is unavailable.
    }

    const permissionEvidence = await getEffectiveMetaPermissionEvidence(activeToken.access_token, intent, {
      businessTargetIds,
    })
    const grantedScopes = permissionEvidence.scopes
    const missingRequiredScope = ['business_management', 'ads_management']
      .find(scope => !grantedScopes.includes(scope))
    if (missingRequiredScope) {
      const reportedPermissions = grantedScopes.length > 0
        ? grantedScopes.join(', ')
        : 'none'
      throw createError({
        statusCode: 403,
        statusMessage: `Meta did not grant the required ${missingRequiredScope} permission. Meta reported these granted permissions: ${reportedPermissions}. Reconnect and approve the requested access.`,
      })
    }

    const adAccounts = permissionEvidence.adAccounts

    // Store each ad account as a social_connection
    for (const account of adAccounts) {
      await queryOne(
        `INSERT INTO social_connections (platform, account_id, account_name, access_token, token_expires_at, scopes, status, metadata, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (platform, account_id)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
           token_expires_at = EXCLUDED.token_expires_at,
           scopes = EXCLUDED.scopes,
           status = 'active',
           metadata = EXCLUDED.metadata,
           connected_by = EXCLUDED.connected_by,
           updated_at = NOW()
         RETURNING id`,
        [
          'meta',
          account.account_id,
          account.name,
          activeToken.access_token,
          expiresAt,
          grantedScopes,
          'active',
          JSON.stringify({
            actId: account.id,
            currency: account.currency,
            accountStatus: account.account_status,
            businessName: account.business_name || null,
            businesses: permissionEvidence.businesses,
          }),
          user.id
        ]
      )
    }

    if (adAccounts.length === 0) {
      const business = permissionEvidence.businesses[0]
      if (!business) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Meta did not return an accessible ad account or Business for this connection.',
        })
      }
      await queryOne(
        `INSERT INTO social_connections (platform, account_id, account_name, access_token, token_expires_at, scopes, status, metadata, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (platform, account_id)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
           token_expires_at = EXCLUDED.token_expires_at,
           scopes = EXCLUDED.scopes,
           status = 'active',
           metadata = EXCLUDED.metadata,
           connected_by = EXCLUDED.connected_by,
           updated_at = NOW()
         RETURNING id`,
        [
          'meta',
          `business_${business.id}`,
          `${business.name} (Meta Business)`,
          activeToken.access_token,
          expiresAt,
          grantedScopes,
          'active',
          JSON.stringify({
            businessId: business.id,
            businessName: business.name,
            businesses: permissionEvidence.businesses,
            catalogConnection: intent === 'catalog',
          }),
          user.id,
        ],
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=meta&success=true&accounts=${adAccounts.length}&intent=${intent}`, 302)
  } catch (err: any) {
    const msg = safeMetaCallbackMessage(
      err.statusMessage || err.data?.statusMessage || err.data?.error?.message || err.message,
    )
    console.error('[Meta Callback] Error:', msg)
    return sendRedirect(event, `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
