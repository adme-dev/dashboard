import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getAdvertiserAccounts, TIKTOK_API_BASE } from '~~/server/utils/tiktokClient'
import { ofetch } from 'ofetch'

/**
 * POST /api/agency/social/tiktok/connect-token
 * Manual token entry — validates a TikTok access token,
 * fetches advertiser accounts, and stores them.
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const token = String(body?.accessToken || '').trim()

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Access token is required' })
  }

  // Validate the token by calling user/info
  let userInfo: { advertiser_ids: string[] }
  try {
    const res = await ofetch<{
      code: number
      message: string
      data: { list: Array<{ advertiser_id: string }> }
    }>(`${TIKTOK_API_BASE}/oauth2/advertiser/get/`, {
      method: 'GET',
      headers: { 'Access-Token': token },
      query: { app_id: useRuntimeConfig().tiktokAppId },
    })
    if (res.code !== 0) {
      throw new Error(res.message || 'Invalid token')
    }
    userInfo = {
      advertiser_ids: (res.data?.list || []).map(a => String(a.advertiser_id)),
    }
  } catch (err: any) {
    const msg = err.data?.message || err.message || 'Invalid token'
    throw createError({ statusCode: 400, statusMessage: `Invalid token: ${msg}` })
  }

  const config = useRuntimeConfig()

  // Fetch advertiser account details
  let advertisers: Awaited<ReturnType<typeof getAdvertiserAccounts>> = []
  if (userInfo.advertiser_ids.length > 0) {
    try {
      advertisers = await getAdvertiserAccounts(token, config.tiktokAppId, userInfo.advertiser_ids)
    } catch (err: any) {
      console.warn('[TikTok ConnectToken] Could not fetch advertiser details:', err.message)
      advertisers = userInfo.advertiser_ids.map(id => ({
        advertiser_id: id,
        advertiser_name: `Advertiser ${id}`,
        currency: 'USD',
        status: 'STATUS_ENABLE',
      }))
    }
  }

  if (advertisers.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No advertiser accounts found for this token' })
  }

  // Store each advertiser
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
        token,
        null,
        ['advertiser_management', 'campaign_management'],
        'active',
        JSON.stringify({
          currency: adv.currency,
          accountStatus: adv.status,
          manualToken: true,
        }),
        user.id
      ]
    )
  }

  return { success: true, accounts: advertisers.length, message: `Connected ${advertisers.length} advertiser account(s)` }
})
