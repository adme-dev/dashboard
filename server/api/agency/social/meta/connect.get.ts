import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getMetaAuthUrl } from '~~/server/utils/metaClient'
import { createMetaOAuthAttempt, type MetaOAuthIntent } from '~~/server/utils/metaOAuthAttempts'
import {
  buildMetaOAuthRedirectUri,
  resolveMetaOAuthRuntimeConfig
} from '~~/server/utils/metaOAuthRuntimeConfig'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * GET /api/agency/social/meta/connect
 * Generates Meta OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const config = resolveMetaOAuthRuntimeConfig(event)
  if (!config.metaAppId || !config.metaAppSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Meta app credentials not configured' })
  }

  const query = getQuery(event)
  const requestedIntent = String(query.intent || '')
  const intent: MetaOAuthIntent = requestedIntent === 'catalog_management'
    ? 'catalog_management'
    : 'connection'
  const requestedConnectionId = String(query.connectionId || '').trim()
  let targetConnectionId: string | undefined
  if (intent === 'catalog_management' && requestedConnectionId) {
    if (!UUID_PATTERN.test(requestedConnectionId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Meta connection ID' })
    }
    const target = await queryOne<{ id: string }>(
      `SELECT id::text AS id
         FROM social_connections
        WHERE id = $1
          AND platform = 'meta'
          AND status = 'active'
          AND connected_by = $2`,
      [requestedConnectionId, user.id]
    )
    if (!target) {
      throw createError({ statusCode: 404, statusMessage: 'Active Meta connection not found' })
    }
    targetConnectionId = target.id
  }
  const attempt = targetConnectionId
    ? await createMetaOAuthAttempt(user.id, intent, { targetConnectionId })
    : await createMetaOAuthAttempt(user.id, intent)

  // Always derive the redirect URI from the incoming request host so it
  // matches the current environment (localhost, preview, production). If the
  // env var happens to be an absolute URL, only its pathname is kept.
  const redirectUri = buildMetaOAuthRedirectUri(event, config.metaRedirectUri)

  const url = getMetaAuthUrl(config.metaAppId, redirectUri, attempt.state, { intent })

  return { url, attemptId: attempt.attemptId }
})
