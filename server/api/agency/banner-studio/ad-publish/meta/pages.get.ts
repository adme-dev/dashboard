import { requireFreshSocialClientAccess } from '~~/server/utils/social/clientAccess'
/**
 * GET /api/agency/banner-studio/ad-publish/meta/pages
 * Fetch Facebook Pages accessible by the connection's token.
 * Required for ad creative creation (page_id in object_story_spec).
 * Query: connectionId
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh as queryOne, queryRowsFresh } from '~~/server/utils/db'
import { getPages } from '~~/server/utils/metaClient'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { connectionId } = getQuery(event) as { connectionId?: string }

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
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

  const pages = await getPages(connection.accessToken)

  const mapped = await queryRowsFresh<{ platform_account_id: string }>(`SELECT platform_account_id FROM social_accounts WHERE client_id=$1 AND platform='facebook' AND is_active=TRUE`, [connection.clientId])
  const allowed = new Set(mapped.map(p => p.platform_account_id))
  return { pages: pages.filter(p => allowed.has(p.id)) }
})
