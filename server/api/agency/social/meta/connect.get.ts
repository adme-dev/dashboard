import { getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getMetaAuthUrl } from '~~/server/utils/metaClient'
import { createMetaOAuthAttempt, type MetaOAuthIntent } from '~~/server/utils/metaOAuthAttempts'

/**
 * GET /api/agency/social/meta/connect
 * Generates Meta OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.metaAppId || !config.metaAppSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Meta app credentials not configured' })
  }

  const requestedIntent = String(getQuery(event).intent || '')
  const intent: MetaOAuthIntent = requestedIntent === 'catalog_management'
    ? 'catalog_management'
    : 'connection'
  const attempt = await createMetaOAuthAttempt(user.id, intent)

  // Always derive the redirect URI from the incoming request host so it
  // matches the current environment (localhost, preview, production). If the
  // env var happens to be an absolute URL, only its pathname is kept.
  const reqUrl = getRequestURL(event)
  const configured = config.metaRedirectUri
  const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
  const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

  const url = getMetaAuthUrl(config.metaAppId, redirectUri, attempt.state, { intent })

  return { url, attemptId: attempt.attemptId }
})
