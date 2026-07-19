import { queryOne, execute } from '~~/server/utils/db'
import { getCampaignInsightsById } from '~~/server/utils/metaClient'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'

/**
 * Re-pull ONE campaign's month-to-date core metrics and update its media_spend row.
 *
 * Meta: single Graph call to the campaign node directly (no account-wide fan-out
 * or pagination — avoids the burst pattern the jobs-consumer throttle suppresses).
 *
 * Google: refresh the (hourly-expiring) access token + resolve the manager
 * login-customer-id the same way the working spend-sync reads do, then a single
 * GAQL query filtered to this campaign id. The earlier "MCC read bug" was a
 * misdiagnosis — the reads work given a fresh token + the right manager header.
 */
export async function refreshSingleCampaignSpend(mediaSpendId: string): Promise<{ refreshed: boolean, error?: string }> {
  const row = await queryOne<GoogleCredentialRow & {
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    connection_id: string
    account_id: string
    access_token: string | null
    refresh_token: string | null
    token_expires_at: string | null
    period: string
  }>(
    `SELECT ms.platform, ms.campaign_id, ms.connection_id::text,
            sc.account_id, sc.access_token, sc.refresh_token, sc.token_expires_at, ms.period,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
       FROM media_spend ms
       JOIN social_connections sc ON sc.id = ms.connection_id
       ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
      WHERE ms.id = $1`,
    [mediaSpendId],
  )
  if (!row || !row.campaign_id || (row.platform === 'meta' && !row.access_token)) {
    return { refreshed: false, error: 'missing connection or campaign' }
  }

  const [year, month] = row.period.split('-').map(Number)

  const writeMetrics = async (spend: number, impressions: number, clicks: number) => {
    // Don't write NaN into numeric columns if the platform returns a malformed value.
    if (!Number.isFinite(spend) || !Number.isFinite(impressions) || !Number.isFinite(clicks)) {
      return { refreshed: false, error: 'non-numeric insights value' }
    }
    await execute(
      `UPDATE media_spend
          SET actual_spend = $2, impressions = $3, clicks = $4, synced_at = NOW()
        WHERE id = $1`,
      [mediaSpendId, spend, impressions, clicks],
    )
    return { refreshed: true }
  }

  try {
    if (row.platform === 'meta') {
      const match = await getCampaignInsightsById(row.campaign_id, row.access_token, month, year)
      if (!match) return { refreshed: false, error: 'campaign not in insights' }
      return await writeMetrics(Number(match.spend), Number(match.impressions), Number(match.clicks))
    }

    // Google
    const credential = await resolveGoogleCredential(row)
    const config = resolveGoogleAdsRuntimeConfig()
    const { refreshGoogleToken, listAccessibleCustomers, getCampaignSpendById } = await import('~~/server/utils/googleAdsClient')
    const { accessToken, loginCustomerId } = await resolveGoogleWriteAuth(
      {
        id: row.connection_id,
        account_id: row.account_id,
        access_token: credential.accessToken,
        refresh_token: credential.refreshToken,
        token_expires_at: credential.tokenExpiresAt,
      },
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
    let match
    try {
      match = await getCampaignSpendById(row.account_id, accessToken, config.googleDeveloperToken, row.campaign_id, month, year, loginCustomerId)
    } catch (err: any) {
      // Directly-owned account under a manager context → retry without the header.
      const status = err?.status || err?.statusCode
      if (status === 403 && loginCustomerId) {
        match = await getCampaignSpendById(row.account_id, accessToken, config.googleDeveloperToken, row.campaign_id, month, year, undefined)
      } else {
        throw err
      }
    }
    if (!match) return { refreshed: false, error: 'campaign not in insights' }
    return await writeMetrics(match.spend, match.impressions, match.clicks)
  } catch (err: any) {
    return { refreshed: false, error: (err?.data?.error?.message || err?.message || 'refresh failed').slice(0, 300) }
  }
}
