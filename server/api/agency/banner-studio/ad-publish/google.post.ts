/**
 * Publish banner to Google Ads as a responsive display ad or HTML5 ad.
 * POST /api/agency/banner-studio/ad-publish/google
 * Body: { publishedId, connectionId, campaignId, adGroupId }
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

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
    SELECT id, account_id AS "accountId", account_name AS "accountName",
      access_token AS "accessToken", refresh_token AS "refreshToken",
      token_expires_at AS "tokenExpiresAt", metadata
    FROM social_connections
    WHERE id = $1 AND platform = 'google'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads connection not found' })
  }

  // Refresh token if needed
  const config = useRuntimeConfig()
  let accessToken = connection.accessToken

  if (new Date(connection.tokenExpiresAt) <= new Date(Date.now() + 300000)) {
    try {
      const { refreshGoogleToken } = await import('~~/server/utils/googleAdsClient')
      const tokens = await refreshGoogleToken(
        connection.refreshToken,
        config.googleClientId,
        config.googleClientSecret,
      )
      accessToken = tokens.access_token

      // Update token in DB
      await queryOne(`
        UPDATE social_connections
        SET access_token = $1, token_expires_at = NOW() + INTERVAL '1 hour'
        WHERE id = $2
      `, [accessToken, connectionId])
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Failed to refresh Google Ads token' })
    }
  }

  // Determine MCC login customer ID
  const metadata = typeof connection.metadata === 'string' ? JSON.parse(connection.metadata) : (connection.metadata || {})
  const loginCustomerId = metadata.loginCustomerId || connection.accountId
  const customerId = connection.accountId.replace(/-/g, '')

  // Create the ad via Google Ads API
  // For HTML5 banners, we need to create a media bundle asset
  const developerToken = config.googleDeveloperToken
  const apiBase = 'https://googleads.googleapis.com/v23'

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
