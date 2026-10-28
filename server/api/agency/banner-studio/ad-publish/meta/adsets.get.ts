import { requireFreshSocialClientAccess } from '~~/server/utils/social/clientAccess'
/**
 * GET /api/agency/banner-studio/ad-publish/meta/adsets
 * Browse ad sets for a Meta campaign.
 * Query: connectionId, campaignId, status? (ACTIVE, PAUSED, etc.)
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh as queryOne } from '~~/server/utils/db'
import { getAdSets, getCampaigns } from '~~/server/utils/metaClient'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { connectionId, campaignId, status } = getQuery(event) as {
    connectionId?: string
    campaignId?: string
    status?: string
  }

  if (!connectionId || !campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId and campaignId are required' })
  }

  const connection = await queryOne(`
    SELECT client_id AS "clientId", account_id AS "accountId", access_token AS "accessToken", token_expires_at AS "tokenExpiresAt"
    FROM social_connections
    WHERE id = $1 AND platform = 'meta' AND status = 'active'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Meta connection not found' })
  }

  await requireFreshSocialClientAccess(event, connection.clientId)

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
    throw createError({ statusCode: 401, statusMessage: 'Meta token has expired. Please reconnect.' })
  }

  const campaigns = await getCampaigns(`act_${String(connection.accountId).replace(/^act_/, '')}`, connection.accessToken)
  if (!campaigns.some(c => c.id === campaignId)) throw createError({ statusCode: 404, statusMessage: 'Campaign unavailable for this client account' })

  const adSets = await getAdSets(campaignId, connection.accessToken, status || undefined)

  return { adSets }
})
