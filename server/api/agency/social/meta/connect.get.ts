import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getMetaAuthUrl } from '~~/server/utils/metaClient'
import {
  createMetaOAuthAttempt,
  type MetaOAuthIntent as PersistedMetaOAuthIntent,
} from '~~/server/utils/metaOAuthAttempts'
import {
  buildMetaOAuthRedirectUri,
  resolveMetaOAuthRuntimeConfig,
} from '~~/server/utils/metaOAuthRuntimeConfig'
import { normalizeMetaOAuthIntent } from '~~/server/utils/metaPermissions'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * GET /api/agency/social/meta/connect
 * Generates a Meta OAuth URL backed by a single-use, server-persisted attempt.
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const config = resolveMetaOAuthRuntimeConfig(event)
  if (!config.metaAppId || !config.metaAppSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Meta app credentials not configured' })
  }

  const query = getQuery(event)
  const requestedIntent = normalizeMetaOAuthIntent(query.intent)
  const attemptIntent: PersistedMetaOAuthIntent = requestedIntent === 'catalog'
    ? 'catalog_management'
    : 'connection'
  const requestedConnectionId = String(query.connectionId || '').trim()
  let targetConnectionId: string | undefined

  if (requestedIntent === 'catalog' && requestedConnectionId) {
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
      [requestedConnectionId, user.id],
    )
    if (!target) {
      throw createError({ statusCode: 404, statusMessage: 'Active Meta connection not found' })
    }
    targetConnectionId = target.id
  }

  const attempt = targetConnectionId
    ? await createMetaOAuthAttempt(user.id, attemptIntent, { targetConnectionId })
    : await createMetaOAuthAttempt(user.id, attemptIntent)
  const redirectUri = buildMetaOAuthRedirectUri(event, config.metaRedirectUri)
  const authOptions = requestedIntent === 'catalog' && config.metaLoginConfigId
    ? { intent: attemptIntent, loginConfigId: config.metaLoginConfigId }
    : { intent: attemptIntent }
  const url = getMetaAuthUrl(config.metaAppId, redirectUri, attempt.state, authOptions)

  return { url, attemptId: attempt.attemptId }
})
