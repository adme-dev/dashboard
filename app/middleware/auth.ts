/**
 * Auth Middleware
 * Protects routes that require authentication
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip auth check for auth pages
  if (to.path.startsWith('/auth/')) {
    return
  }

  const { user, fetchUser, initialized } = useAuth()

  // Fetch user if not initialized
  if (!initialized.value) {
    await fetchUser()
  }

  // Redirect to login if not authenticated
  if (!user.value) {
    return navigateTo({
      path: '/auth/login',
      query: { redirect: to.fullPath }
    })
  }
})
