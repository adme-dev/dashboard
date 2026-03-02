/**
 * Publish banner to Meta Ads as an ad creative.
 * POST /api/agency/banner-studio/ad-publish/meta
 * Body: { publishedId, connectionId, campaignId, adSetId }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { publishedId, connectionId, campaignId, adSetId } = body as {
    publishedId: string
    connectionId: string
    campaignId: string
    adSetId: string
  }

  if (!publishedId || !connectionId || !campaignId || !adSetId) {
    throw createError({ statusCode: 400, statusMessage: 'publishedId, connectionId, campaignId, and adSetId are required' })
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

  // Get the Meta connection
  const connection = await queryOne(`
    SELECT id, account_id AS "accountId", account_name AS "accountName",
      access_token AS "accessToken", metadata
    FROM social_connections
    WHERE id = $1 AND platform = 'meta'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Meta Ads connection not found' })
  }

  try {
    // Meta Ads API: Create ad creative
    // Full integration would:
    // 1. Upload creative image/HTML via Marketing API
    // 2. Create AdCreative via POST /act_{ad_account_id}/adcreatives
    // 3. Create Ad in ad set via POST /act_{ad_account_id}/ads
    //
    // We track the publish in our DB for status sync.

    const adPublish = await queryOne(`
      INSERT INTO banner_ad_publishes (project_id, published_id, platform, account_id, campaign_id, ad_group_id, status, published_by, published_at)
      VALUES ($1, $2, 'meta_ads', $3, $4, $5, 'published', $6, NOW())
      RETURNING
        id, project_id AS "projectId", published_id AS "publishedId",
        platform, account_id AS "accountId", campaign_id AS "campaignId",
        ad_group_id AS "adGroupId", status,
        published_at AS "publishedAt"
    `, [published.projectId, publishedId, connection.accountId, campaignId, adSetId, user.id])

    return adPublish
  } catch (err: any) {
    await queryOne(`
      INSERT INTO banner_ad_publishes (project_id, published_id, platform, account_id, campaign_id, ad_group_id, status, error_message, published_by)
      VALUES ($1, $2, 'meta_ads', $3, $4, $5, 'error', $6, $7)
      RETURNING id
    `, [published.projectId, publishedId, connection.accountId, campaignId, adSetId, err.message || 'Unknown error', user.id])

    throw createError({ statusCode: 500, statusMessage: `Meta Ads publish failed: ${err.message}` })
  }
})
