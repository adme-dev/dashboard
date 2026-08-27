import { sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeForLongLivedToken,
  exchangeMetaCode,
} from '~~/server/utils/metaClient'
import { consumeMetaOAuthAttempt } from '~~/server/utils/metaOAuthAttempts'
import {
  buildMetaOAuthRedirectUri,
  resolveMetaOAuthRuntimeConfig,
} from '~~/server/utils/metaOAuthRuntimeConfig'
import { getEffectiveMetaPermissionEvidence } from '~~/server/utils/metaPermissionEvidence'
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
 * Exchanges Meta OAuth codes and persists only capabilities proven by Meta.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)
    const code = String(query.code || '')
    const state = String(query.state || '')
    const errorParam = String(query.error || '')

    if (errorParam) {
      const errorReason = safeMetaCallbackMessage(
        String(query.error_reason || query.error_description || errorParam),
      )
      return sendRedirect(
        event,
        `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent(errorReason)}`,
        302,
      )
    }

    const attempt = state ? await consumeMetaOAuthAttempt(state, user.id) : null
    if (!code || !attempt) {
      return sendRedirect(
        event,
        `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent('Invalid OAuth state. Please try again.')}`,
        302,
      )
    }
    const intent = attempt.intent === 'catalog_management' ? 'catalog' : 'baseline'

    const config = resolveMetaOAuthRuntimeConfig(event)
    if (!config.metaAppId || !config.metaAppSecret) {
      throw createError({ statusCode: 500, statusMessage: 'Meta app credentials not configured' })
    }
    const redirectUri = buildMetaOAuthRedirectUri(event, config.metaRedirectUri)
    const shortToken = await exchangeMetaCode(
      code,
      config.metaAppId,
      config.metaAppSecret,
      redirectUri,
    )

    // Facebook Login for Business binds the code-exchange token to config_id.
    // Exchanging it again through the legacy long-lived-token endpoint strips
    // that Business configuration, so catalogue upgrades retain this token.
    const activeToken = intent === 'catalog'
      ? shortToken
      : await exchangeForLongLivedToken(
          shortToken.access_token,
          config.metaAppId,
          config.metaAppSecret,
        )
    const expiresAt = activeToken.expires_in
      ? new Date(Date.now() + activeToken.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

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

    const permissionEvidence = await getEffectiveMetaPermissionEvidence(
      activeToken.access_token,
      intent,
      { businessTargetIds },
    )
    const grantedScopes = permissionEvidence.scopes
    const requiredScopes = intent === 'catalog'
      ? ['business_management', 'ads_management', 'catalog_management']
      : ['business_management', 'ads_management']
    const missingRequiredScope = requiredScopes.find(scope => !grantedScopes.includes(scope))
    if (missingRequiredScope) {
      const reportedPermissions = grantedScopes.length > 0 ? grantedScopes.join(', ') : 'none'
      throw createError({
        statusCode: 403,
        statusMessage: `Meta did not grant the required ${missingRequiredScope} permission. Meta reported these granted permissions: ${reportedPermissions}. Reconnect and approve the requested access.`,
      })
    }

    for (const account of permissionEvidence.adAccounts) {
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
          user.id,
        ],
      )
    }

    if (permissionEvidence.adAccounts.length === 0) {
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
            upgradedFromConnectionId: attempt.targetConnectionId,
          }),
          user.id,
        ],
      )
    }

    return sendRedirect(
      event,
      `/auth/oauth-callback?platform=meta&success=true&accounts=${permissionEvidence.adAccounts.length}&intent=${intent}`,
      302,
    )
  } catch (error: unknown) {
    const err = error as {
      statusMessage?: string
      message?: string
      data?: { statusMessage?: string, error?: { message?: string } }
    }
    const msg = safeMetaCallbackMessage(
      err.statusMessage || err.data?.statusMessage || err.data?.error?.message || err.message,
    )
    console.error('[Meta Callback] Error:', msg)
    return sendRedirect(
      event,
      `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent(msg)}`,
      302,
    )
  }
})
