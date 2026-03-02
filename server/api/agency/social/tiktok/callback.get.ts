import { getCookie, deleteCookie, sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeTikTokCode,
  getAdvertiserAccounts
} from '~~/server/utils/tiktokClient'

/**
 * GET /api/agency/social/tiktok/callback
 * OAuth callback — exchanges auth_code for token, stores advertiser accounts.
 * TikTok sends `auth_code` (not `code`) and tokens are long-lived (no exchange needed).
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const authCode = String(query.auth_code || '')
    const state = String(query.state || '')
    const expectedState = getCookie(event, 'tiktok_oauth_state')

    if (!authCode || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=tiktok&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'tiktok_oauth_state', { path: '/' })

    const config = useRuntimeConfig()

    // Exchange auth_code for access token (TikTok tokens are long-lived)
    const tokenResult = await exchangeTikTokCode(
      authCode,
      config.tiktokAppId,
      config.tiktokAppSecret
    )

    // Fetch advertiser account details
    let advertisers: Awaited<ReturnType<typeof getAdvertiserAccounts>> = []
    if (tokenResult.advertiser_ids.length > 0) {
      try {
        advertisers = await getAdvertiserAccounts(
          tokenResult.access_token,
          config.tiktokAppId,
          tokenResult.advertiser_ids
        )
      } catch (err: any) {
        console.warn('[TikTok Callback] Could not fetch advertiser details:', err.message)
        // Fallback: create entries from advertiser IDs without names
        advertisers = tokenResult.advertiser_ids.map(id => ({
          advertiser_id: id,
          advertiser_name: `Advertiser ${id}`,
          currency: 'USD',
          status: 'STATUS_ENABLE',
        }))
      }
    }

    // Store each advertiser as a social_connection
    for (const adv of advertisers) {
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
          'tiktok',
          adv.advertiser_id,
          adv.advertiser_name,
          tokenResult.access_token,
          null, // TikTok tokens don't expire (long-lived)
          ['advertiser_management', 'campaign_management'],
          'active',
          JSON.stringify({
            currency: adv.currency,
            accountStatus: adv.status,
          }),
          user.id
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=tiktok&success=true&accounts=${advertisers.length}`, 302)
  } catch (err: any) {
    console.error('[TikTok Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=tiktok&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
