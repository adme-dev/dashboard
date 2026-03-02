import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getLinkedInAdAccounts } from '~~/server/utils/linkedinClient'

/**
 * POST /api/agency/social/linkedin/connect-token
 * Manual token entry — validates a LinkedIn access token,
 * fetches ad accounts, and stores them.
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const token = String(body?.accessToken || '').trim()

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Access token is required' })
  }

  // Validate the token by fetching ad accounts
  let adAccounts: Awaited<ReturnType<typeof getLinkedInAdAccounts>> = []
  try {
    adAccounts = await getLinkedInAdAccounts(token)
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
        'linkedin',
        acct.id,
        acct.name,
        token,
        null, // Manual tokens — expiry unknown
        ['r_ads', 'r_ads_reporting'],
        'active',
        JSON.stringify({
          currency: acct.currency,
          accountStatus: acct.status,
          manualToken: true,
        }),
        user.id
      ]
    )
  }

  return { success: true, accounts: adAccounts.length, message: `Connected ${adAccounts.length} ad account(s)` }
})
