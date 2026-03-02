import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  getTwitterAuthUrl
} from '~~/server/utils/twitterClient'

/**
 * GET /api/agency/social/twitter/connect
 * Generates X (Twitter) OAuth 2.0 URL with PKCE and returns it for frontend redirect.
 * Stores code_verifier in httpOnly cookie for use in callback.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.twitterClientId || !config.twitterClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Twitter app credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // PKCE: generate code_verifier and code_challenge
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'twitter_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  // Store PKCE code_verifier in httpOnly cookie (10 min expiry)
  setCookie(event, 'twitter_pkce_verifier', codeVerifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.twitterRedirectUri.startsWith('http')
    ? config.twitterRedirectUri
    : `${publicUrl}${config.twitterRedirectUri}`

  const url = getTwitterAuthUrl(config.twitterClientId, redirectUri, state, codeChallenge)

  return { url }
})
