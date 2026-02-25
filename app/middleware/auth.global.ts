/**
 * Global Auth Middleware
 * Protects all routes except public ones
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Public routes that don't require authentication
  const publicRoutes = [
    '/login',
    '/auth/login',
    '/auth/xeroflow',
    '/auth/magic-link',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/landing',
    '/'
  ]
  
  const isPublicRoute = publicRoutes.some(route => 
    to.path === route || to.path.startsWith(route + '/')
  )
  
  if (isPublicRoute) {
    return
  }

  // Portal routes have their own auth middleware
  if (to.path.startsWith('/portal')) {
    return
  }
  
  // Check for auth token
  const authToken = useCookie('auth_token').value
  const authStatus = useCookie('auth_status').value
  const clientToken = useCookie('auth_token_client').value
  
  console.log('[Auth Middleware] Path:', to.path)
  console.log('[Auth Middleware] auth_token exists:', !!authToken)
  console.log('[Auth Middleware] auth_status:', authStatus)
  console.log('[Auth Middleware] auth_token_client exists:', !!clientToken)
  
  // If we have any form of auth, allow access
  const hasAuth = authToken || clientToken || authStatus === 'logged_in'
  
  if (!hasAuth) {
    console.log('[Auth Middleware] No auth found, redirecting')
    return navigateTo({
      path: '/login',
      query: { 
        redirect: encodeURIComponent(to.fullPath)
      }
    })
  }
  
  console.log('[Auth Middleware] Auth found, allowing access')
})
