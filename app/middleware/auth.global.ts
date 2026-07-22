/**
 * Global Auth Middleware
 * Protects all routes except public ones.
 *
 * Auth detection uses three cookies set at login:
 *   auth_token        — httpOnly (server-readable only)
 *   auth_status       — non-httpOnly ("logged_in" flag for client detection)
 *   auth_token_client — non-httpOnly (fallback for client-side middleware)
 *
 * During SSR, useCookie can read httpOnly cookies from the request.
 * During client-side navigation, only non-httpOnly cookies are visible.
 */

export default defineNuxtRouteMiddleware(async (to, _from) => {
  // Public routes that don't require authentication
  const publicPrefixes = [
    '/auth/',
    '/landing',
    '/features',
    '/pricing',
    '/contact',
    '/resources',
    '/platform',
    '/privacy',
    '/terms',
    '/support',
    '/about',
    '/ai-training',
    '/ai-assistants',
    '/banner-studio',
    '/creativity',
    '/portal',
    '/email/', // public email-marketing pages: unsubscribe / subscribe / confirm
    '/l/',
    '/lobby',
    '/lobby-room'
  ]

  if (to.path === '/' || to.path === '/voice-ai' || publicPrefixes.some(p => to.path.startsWith(p))) {
    return
  }

  // Check all three auth signals — any one is sufficient
  const authToken = useCookie('auth_token').value // readable during SSR
  const authStatus = useCookie('auth_status').value // readable always
  const clientToken = useCookie('auth_token_client').value // readable always

  const hasAuth = authToken || clientToken || authStatus === 'logged_in'

  if (!hasAuth) {
    return navigateTo({
      path: '/auth/login',
      query: {
        redirect: to.fullPath
      }
    })
  }
})
