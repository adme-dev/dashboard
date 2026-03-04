/**
 * GET /api/agency/banner-studio/ad-publish/meta/pages
 * Fetch Facebook Pages accessible by the connection's token.
 * Required for ad creative creation (page_id in object_story_spec).
 * Query: connectionId
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getPages } from '~~/server/utils/metaClient'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { connectionId } = getQuery(event) as { connectionId?: string }

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const connection = await queryOne(`
    SELECT access_token AS "accessToken", token_expires_at AS "tokenExpiresAt"
    FROM social_connections
    WHERE id = $1 AND platform = 'meta' AND status = 'active'
  `, [connectionId]) as any

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Meta connection not found' })
  }

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date()) {
    throw createError({ statusCode: 401, statusMessage: 'Meta token has expired. Please reconnect.' })
  }

  const pages = await getPages(connection.accessToken)

  return { pages }
})
