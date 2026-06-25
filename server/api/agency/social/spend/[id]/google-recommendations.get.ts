import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { fetchGoogleRecommendations } from '~~/server/utils/googleRecommendations'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

/**
 * GET /api/agency/social/spend/:id/google-recommendations
 * Read-only (unflagged). Resolves the Google account + campaign for this
 * media_spend row, fetches that account's optimization recommendations, and
 * returns them with the campaign id so the slideover can highlight the matching
 * budget rec. Google rows only; Meta rows return empty. Fail-safe.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    conn_id: string
    account_id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  }>(
    `SELECT ms.platform, ms.campaign_id,
            sc.id::text AS conn_id, sc.account_id, sc.access_token, sc.refresh_token, sc.token_expires_at
     FROM media_spend ms
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.id = $1`,
    [id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })

  // Google-only feature; Meta has no equivalent recommendations API.
  if (row.platform !== 'google_ads') {
    return { optimizationScore: null, recommendations: [], campaignId: row?.campaign_id ?? null }
  }

  const config = resolveGoogleAdsRuntimeConfig()
  try {
    const { refreshGoogleToken, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
    const { accessToken, loginCustomerId } = await resolveGoogleWriteAuth(
      { id: row.conn_id, account_id: row.account_id, access_token: row.access_token, refresh_token: row.refresh_token, token_expires_at: row.token_expires_at },
      {
        googleClientId: config.googleClientId,
        googleClientSecret: config.googleClientSecret,
        googleDeveloperToken: config.googleDeveloperToken,
        googleAdsLoginCustomerId: (config.googleAdsLoginCustomerId as string) || '',
      },
      {
        refreshGoogleToken,
        listAccessibleCustomers,
        updateToken: async (cid, tok, exp) => {
          await execute(
            `UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
            [tok, exp, cid],
          )
        },
      },
    )
    const result = await fetchGoogleRecommendations(row.account_id, accessToken, config.googleDeveloperToken, loginCustomerId)
    return { ...result, campaignId: row.campaign_id }
  } catch (err: any) {
    return { optimizationScore: null, recommendations: [], campaignId: row.campaign_id, error: (err?.message || 'failed').slice(0, 300) }
  }
})
