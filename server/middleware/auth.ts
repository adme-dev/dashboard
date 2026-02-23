import { validateSession, hasRole } from '../utils/auth'

// Routes that don't require authentication
const publicRoutes = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/magic-link',
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
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : getCookie(event, 'auth_token')
  
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

  // Validate session
  const user = await validateSession(token)
  
  if (!user) {
    deleteCookie(event, 'auth_token')
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired session',
      data: {
        redirect: '/login',
        message: 'Your session has expired. Please sign in again.'
      }
    })
  }

  event.context.user = user
  event.context.auth = { userId: user.id, role: user.role }
})
