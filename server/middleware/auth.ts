import { validateSession, TransientAuthError } from '../utils/auth'
import { kvGet, kvPut } from '../utils/kv'

// Routes that don't require authentication
const publicRoutes = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/magic-link',
  '/api/auth/dev-login',
  '/api/auth/xeroflow',
  '/api/admin/create-super-admin',
  '/api/admin/magic-link-debug',
  '/api/test/cookies',
  '/api/webhooks',
  '/api/xero/callback',
  '/api/_nuxt_icon',
  '/_nuxt',
  '/__nuxt_devtools__'
]

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)

  // Skip auth for public API routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return
  }

  // Skip auth for non-API routes (pages handled by middleware in app)
  if (!pathname.startsWith('/api/')) {
    return
  }

  // Get token from cookie or Authorization header
  // Falls back to auth_token_client (non-httpOnly) for environments where
  // httpOnly cookies aren't reliably sent (e.g. after XHR-based login flows)
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
      data: {
        redirect: '/login',
        message: 'Please sign in to continue'
      }
    })
  }

  // Check KV cache first (use first 16 chars of token as key — safe, not sensitive)
  const cacheKey = `auth-session:${token.slice(0, 16)}`
  const cachedUser = await kvGet<{ id: string; email: string; name: string; role: string; is_active: boolean; avatar_url?: string }>(event, cacheKey)

  if (cachedUser) {
    event.context.user = cachedUser
    event.context.auth = { userId: cachedUser.id, role: cachedUser.role }
    return
  }

  // Validate session via DB
  try {
    const user = await validateSession(token)

    if (!user) {
      // Token is genuinely invalid or user deactivated — clear cookies
      deleteCookie(event, 'auth_token')
      deleteCookie(event, 'auth_token_client')
      deleteCookie(event, 'auth_status')
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid or expired session',
        data: {
          redirect: '/login',
          message: 'Your session has expired. Please sign in again.'
        }
      })
    }

    // Cache in KV for 5 minutes
    kvPut(event, cacheKey, user, 300)

    event.context.user = user
    event.context.auth = { userId: user.id, role: user.role }
  } catch (error: any) {
    // Re-throw HTTP errors (our own 401 above)
    if (error.statusCode) throw error

    // Transient DB errors — return 503, do NOT delete cookies
    if (error instanceof TransientAuthError || error.name === 'TransientAuthError') {
      console.error('[Auth Middleware] Transient DB error, returning 503:', error.message)
      throw createError({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable — please retry'
      })
    }

    // Unknown errors — also 503, don't nuke the session
    console.error('[Auth Middleware] Unexpected error during auth:', error)
    throw createError({
      statusCode: 503,
      statusMessage: 'Service temporarily unavailable'
    })
  }
})
