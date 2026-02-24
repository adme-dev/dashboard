import { getCookie, deleteCookie, sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import {
  exchangeMetaCode,
  exchangeForLongLivedToken,
  getAdAccounts
} from '~~/server/utils/metaClient'

/**
 * GET /api/agency/social/meta/callback
 * OAuth callback — exchanges code for long-lived token, stores ad accounts
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const code = String(query.code || '')
  const state = String(query.state || '')
  const expectedState = getCookie(event, 'meta_oauth_state')

  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth state or code' })
  }

  deleteCookie(event, 'meta_oauth_state', { path: '/' })

  const config = useRuntimeConfig()
  const publicUrl = config.public.appUrl || 'http://localhost:3000'
  const redirectUri = config.metaRedirectUri.startsWith('http')
    ? config.metaRedirectUri
    : `${publicUrl}${config.metaRedirectUri}`

  // Exchange code for short-lived token
  const shortToken = await exchangeMetaCode(
    code,
    config.metaAppId,
    config.metaAppSecret,
    redirectUri
  )

  // Exchange for long-lived token (~60 days)
  const longToken = await exchangeForLongLivedToken(
    shortToken.access_token,
    config.metaAppId,
    config.metaAppSecret
  )

  const expiresAt = longToken.expires_in
    ? new Date(Date.now() + longToken.expires_in * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // default 60 days

  // Fetch ad accounts
  const adAccounts = await getAdAccounts(longToken.access_token)

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
        longToken.access_token,
        expiresAt,
        ['ads_read'],
        'active',
        JSON.stringify({
          actId: account.id,
          currency: account.currency,
          accountStatus: account.account_status,
          businessName: account.business_name || null
        }),
        user.id
      ]
    )
  }

  // Redirect to settings page
  return sendRedirect(event, '/settings?tab=social&connected=meta', 302)
})
