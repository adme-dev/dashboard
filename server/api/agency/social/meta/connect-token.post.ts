import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeForLongLivedToken
} from '~~/server/utils/metaClient'
import { getEffectiveMetaPermissionEvidence } from '~~/server/utils/metaPermissionEvidence'
import { resolveMetaOAuthRuntimeConfig } from '~~/server/utils/metaOAuthRuntimeConfig'
import { ofetch } from 'ofetch'

/**
 * POST /api/agency/social/meta/connect-token
 * Manual token entry — validates a user access token, exchanges for long-lived,
 * fetches ad accounts, and stores them. Useful when the OAuth popup is blocked
 * or the Meta App isn't fully configured.
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const token = String(body?.accessToken || '').trim()

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Access token is required' })
  }

  // Validate the token by calling /me
  let me: { id: string; name: string }
  try {
    me = await ofetch('https://graph.facebook.com/v25.0/me', {
      headers: { Authorization: `Bearer ${token}` },
      query: { fields: 'id,name' }
    })
  } catch (err: any) {
    const fbError = err.data?.error?.message || err.message || 'Invalid token'
    throw createError({ statusCode: 400, statusMessage: `Invalid token: ${fbError}` })
  }

  // Try to exchange for a long-lived token
  const config = resolveMetaOAuthRuntimeConfig(event)
  let longLivedToken = token
  let expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // default 2 hours

  if (config.metaAppId && config.metaAppSecret) {
    try {
      const longToken = await exchangeForLongLivedToken(token, config.metaAppId, config.metaAppSecret)
      longLivedToken = longToken.access_token
      expiresAt = longToken.expires_in
        ? new Date(Date.now() + longToken.expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days
    } catch (err: any) {
      console.warn('[Meta ConnectToken] Could not exchange for a long-lived token; continuing with the supplied token.')
      // Continue with the short-lived token
    }
  }

  const permissionEvidence = await getEffectiveMetaPermissionEvidence(longLivedToken, 'catalog')
  const grantedScopes = permissionEvidence.scopes
  const adAccounts = permissionEvidence.adAccounts
  if (!permissionEvidence.evidence.adsManagement) {
    console.warn('[Meta ConnectToken] Could not fetch ad accounts; storing the verified Meta profile connection.')
  }

  if (adAccounts.length === 0) {
    // Store a single connection using the user's Meta profile
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
        me.id,
        me.name,
        longLivedToken,
        expiresAt,
        grantedScopes,
        'active',
        JSON.stringify({ userId: me.id, userName: me.name, manualToken: true }),
        user.id
      ]
    )
    return { success: true, accounts: 1, message: `Connected as ${me.name} (no ad accounts found)` }
  }

  // Store each ad account
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
        longLivedToken,
        expiresAt,
        grantedScopes,
        'active',
        JSON.stringify({
          actId: account.id,
          currency: account.currency,
          accountStatus: account.account_status,
          businessName: account.business_name || null,
          manualToken: true
        }),
        user.id
      ]
    )
  }

  return { success: true, accounts: adAccounts.length, message: `Connected ${adAccounts.length} ad account(s)` }
})
