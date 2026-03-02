/**
 * List ad platform publishes for a project.
 * GET /api/agency/banner-studio/ad-publish?projectId=xxx
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectId } = getQuery(event) as { projectId?: string }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  return queryRows(`
    SELECT
      ap.id, ap.project_id AS "projectId", ap.published_id AS "publishedId",
      ap.platform, ap.account_id AS "accountId",
      ap.campaign_id AS "campaignId", ap.ad_group_id AS "adGroupId",
      ap.ad_id AS "adId", ap.status, ap.error_message AS "errorMessage",
      ap.published_at AS "publishedAt", ap.created_at AS "createdAt",
      p.format_key AS "formatKey", p.width, p.height,
      sc.account_name AS "accountName",
      u.name AS "publishedByName"
    FROM banner_ad_publishes ap
    JOIN banner_published p ON p.id = ap.published_id
    LEFT JOIN social_connections sc ON sc.account_id = ap.account_id AND sc.platform = CASE WHEN ap.platform = 'google_ads' THEN 'google' ELSE 'meta' END
    LEFT JOIN team_members u ON u.id = ap.published_by
    WHERE ap.project_id = $1
    ORDER BY ap.created_at DESC
  `, [projectId])
})
