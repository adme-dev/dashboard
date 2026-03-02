import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  getSnapchatOrganizations,
  getSnapchatAdAccounts,
  SNAPCHAT_API_BASE
} from '~~/server/utils/snapchatClient'

/**
 * POST /api/agency/social/snapchat/connect-token
 * Manual token entry — validates a Snapchat access token,
 * fetches organizations and ad accounts, and stores them.
 * Body: { accessToken, refreshToken? }
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const token = String(body?.accessToken || '').trim()
  const refreshToken = String(body?.refreshToken || '').trim() || null

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Access token is required' })
  }

  // Validate the token by fetching organizations
  let allAccounts: Array<{
    id: string
    name: string
    currency: string
    status: string
    orgId: string
    orgName: string
  }> = []

  try {
    const orgs = await getSnapchatOrganizations(token)
    if (orgs.length === 0) {
      throw new Error('No organizations found')
    }

    for (const org of orgs) {
      try {
        const accounts = await getSnapchatAdAccounts(org.id, token)
        for (const acct of accounts) {
          allAccounts.push({
            id: acct.id,
            name: acct.name,
            currency: acct.currency,
            status: acct.status,
            orgId: org.id,
            orgName: org.name,
          })
        }
      } catch (err: any) {
        console.warn(`[Snapchat ConnectToken] Could not fetch accounts for org ${org.name}:`, err.message)
      }
    }
  } catch (err: any) {
    const msg = err.data?.message || err.message || 'Invalid token'
    throw createError({ statusCode: 400, statusMessage: `Invalid token: ${msg}` })
  }

  if (allAccounts.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No ad accounts found for this token' })
  }

  // Token expires in 30 min — store expiry estimate
  const tokenExpiresAt = new Date(Date.now() + 1800 * 1000)

  // Store each ad account
  for (const acct of allAccounts) {
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
        'snapchat',
        acct.id,
        acct.name,
        token,
        refreshToken,
        tokenExpiresAt,
        ['snapchat-marketing-api'],
        'active',
        JSON.stringify({
          currency: acct.currency,
          accountStatus: acct.status,
          orgId: acct.orgId,
          orgName: acct.orgName,
          manualToken: true,
        }),
        user.id
      ]
    )
  }

  return { success: true, accounts: allAccounts.length, message: `Connected ${allAccounts.length} ad account(s)` }
})
