/**
 * GET /api/agency/banner-studio/ad-publish/meta/campaigns
 * Browse campaigns for a Meta Ads connection.
 * Query: connectionId, status? (ACTIVE, PAUSED, etc.)
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getCampaigns } from '~~/server/utils/metaClient'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { connectionId, status } = getQuery(event) as { connectionId?: string; status?: string }

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const connection = await queryOne(`
    SELECT account_id AS "accountId", access_token AS "accessToken",
      metadata, token_expires_at AS "tokenExpiresAt"
    FROM social_connections
    WHERE id = $1 AND platform = 'meta' AND status = 'active'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Meta connection not found' })
  }

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
    throw createError({ statusCode: 401, statusMessage: 'Meta token has expired. Please reconnect.' })
  }

  const actId = connection.metadata?.actId || `act_${connection.accountId}`
  const campaigns = await getCampaigns(actId, connection.accessToken, status || undefined)

  return { campaigns }
})
