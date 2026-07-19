import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { fetchGoogleRecommendations } from '~~/server/utils/googleRecommendations'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'

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

  const row = await queryOne<GoogleCredentialRow & {
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    conn_id: string
    account_id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  }>(
    `SELECT ms.platform, ms.campaign_id,
            sc.id::text AS conn_id, sc.account_id, sc.access_token, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM media_spend ms
     JOIN social_connections sc ON sc.id = ms.connection_id
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
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
    const credential = await resolveGoogleCredential(row)
    const { refreshGoogleToken, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
    const { accessToken, loginCustomerId } = await resolveGoogleWriteAuth(
      { id: row.conn_id, account_id: row.account_id, access_token: credential.accessToken, refresh_token: credential.refreshToken, token_expires_at: credential.tokenExpiresAt },
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
          await persistGoogleCredentialRefresh({
            connectionId: cid,
            profileId: credential.profileId,
            accessToken: tok,
            expiresAt: exp,
          })
        },
      },
    )
    const result = await fetchGoogleRecommendations(row.account_id, accessToken, config.googleDeveloperToken, loginCustomerId)
    return { ...result, campaignId: row.campaign_id }
  } catch (err: any) {
    return { optimizationScore: null, recommendations: [], campaignId: row.campaign_id, error: (err?.message || 'failed').slice(0, 300) }
  }
})
