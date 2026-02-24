/**
 * Auth Middleware (named)
 * Protects routes that explicitly require authentication
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  const { user, isAuthenticated, fetchUser, isLoading } = useAuth()

  // Fetch user if not yet loaded
  if (!isAuthenticated.value && !isLoading.value) {
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
