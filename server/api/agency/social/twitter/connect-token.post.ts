import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getTwitterAdAccounts } from '~~/server/utils/twitterClient'

/**
 * POST /api/agency/social/twitter/connect-token
 * Manual token entry — validates an X access token,
 * fetches ad accounts, and stores them.
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const token = String(body?.accessToken || '').trim()
  const refreshToken = String(body?.refreshToken || '').trim() || null

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Access token is required' })
  }

  // Validate the token by fetching ad accounts
  let adAccounts: Awaited<ReturnType<typeof getTwitterAdAccounts>> = []
  try {
    adAccounts = await getTwitterAdAccounts(token)
  } catch (err: any) {
    const msg = err.data?.message || err.message || 'Invalid token'
    throw createError({ statusCode: 400, statusMessage: `Invalid token: ${msg}` })
  }

  if (adAccounts.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No ad accounts found for this token' })
  }

  // Store each ad account
  for (const acct of adAccounts) {
    await queryOne(
      `INSERT INTO social_connections (platform, account_id, account_name, access_token, refresh_token, token_expires_at, scopes, status, metadata, connected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (platform, account_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, social_connections.refresh_token),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         status = 'active',
         metadata = EXCLUDED.metadata,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()
       RETURNING id`,
      [
        'twitter',
        acct.id,
        acct.name,
        token,
        refreshToken,
        null, // Unknown expiry for manual tokens
        ['ads.read', 'offline.access'],
        'active',
        JSON.stringify({
          currency: acct.currency,
          timezone: acct.timezone,
          approvalStatus: acct.approval_status,
          manualToken: true,
        }),
        user.id,
      ]
    )
  }

  return { success: true, accounts: adAccounts.length, message: `Connected ${adAccounts.length} ad account(s)` }
})
