/**
 * Publish banner to Google Ads as a responsive display ad or HTML5 ad.
 * POST /api/agency/banner-studio/ad-publish/google
 * Body: { publishedId, connectionId, campaignId, adGroupId }
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
} from '~~/server/utils/googleCredentialProfiles'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { publishedId, connectionId, campaignId, adGroupId } = body as {
    publishedId: string
    connectionId: string
    campaignId: string
    adGroupId: string
  }

  if (!publishedId || !connectionId || !campaignId || !adGroupId) {
    throw createError({ statusCode: 400, statusMessage: 'publishedId, connectionId, campaignId, and adGroupId are required' })
  }

  // Get the published banner
  const published = await queryOne(`
    SELECT id, project_id AS "projectId", format_key AS "formatKey",
      url, width, height, click_url AS "clickUrl"
    FROM banner_published WHERE id = $1
  `, [publishedId]) as any

  if (!published) {
    throw createError({ statusCode: 404, statusMessage: 'Published banner not found' })
  }

  // Get the Google Ads connection
  const connection = await queryOne(`
    SELECT sc.id, sc.account_id, sc.account_name, sc.access_token,
      sc.refresh_token, sc.token_expires_at, sc.metadata,
      ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
    FROM social_connections sc
    ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
    WHERE sc.id = $1 AND sc.platform = 'google'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads connection not found' })
  }

  // Refresh token if needed
  const config = useRuntimeConfig()
  const credential = await resolveGoogleCredential(connection)
  let accessToken = credential.accessToken

  if (credential.refreshToken && credential.tokenExpiresAt && new Date(credential.tokenExpiresAt) <= new Date(Date.now() + 300000)) {
    try {
      const { refreshGoogleToken } = await import('~~/server/utils/googleAdsClient')
      const tokens = await refreshGoogleToken(
        credential.refreshToken,
        config.googleClientId,
        config.googleClientSecret,
      )
      accessToken = tokens.access_token

      await persistGoogleCredentialRefresh({
        connectionId,
        profileId: credential.profileId,
        accessToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Failed to refresh Google Ads token' })
    }
  }

  // Determine MCC login customer ID
  const metadata = typeof connection.metadata === 'string' ? JSON.parse(connection.metadata) : (connection.metadata || {})
  const loginCustomerId = metadata.managerCustomerId || metadata.loginCustomerId || connection.account_id
  const customerId = connection.account_id.replace(/-/g, '')

  // Create the ad via Google Ads API
  // For HTML5 banners, we need to create a media bundle asset
  try {
    // Note: Google Ads HTML5 upload requires a zip bundle via the API.
    // For now, we create a record tracking the publish intent.
    // Full API integration would require:
    // 1. Fetch HTML from R2, package as zip
    // 2. Upload as MediaBundle asset via /customers/{id}/mediaFiles:mutate
    // 3. Create AdGroupAd with HTML5 creative via /customers/{id}/adGroupAds:mutate
    //
    // We track the publish in our DB for status sync and store the intent.

    const adPublish = await queryOne(`
      INSERT INTO banner_ad_publishes (project_id, published_id, platform, account_id, campaign_id, ad_group_id, status, published_by, published_at)
      VALUES ($1, $2, 'google_ads', $3, $4, $5, 'pending', $6, NOW())
      RETURNING
        id, project_id AS "projectId", published_id AS "publishedId",
        platform, account_id AS "accountId", campaign_id AS "campaignId",
        ad_group_id AS "adGroupId", status,
        published_at AS "publishedAt"
    `, [published.projectId, publishedId, customerId, campaignId, adGroupId, user.id])

    return adPublish
  } catch (err: any) {
    // Record the error
    await queryOne(`
      INSERT INTO banner_ad_publishes (project_id, published_id, platform, account_id, campaign_id, ad_group_id, status, error_message, published_by)
      VALUES ($1, $2, 'google_ads', $3, $4, $5, 'error', $6, $7)
      RETURNING id
    `, [published.projectId, publishedId, customerId, campaignId, adGroupId, err.message || 'Unknown error', user.id])

    throw createError({ statusCode: 500, statusMessage: `Google Ads publish failed: ${err.message}` })
  }
})
