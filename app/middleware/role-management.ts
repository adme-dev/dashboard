/**
 * Management Route Middleware
 * Protects routes that require MANAGEMENT access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isAuthenticated, fetchUser, isLoading, hasRole } = useAuth()

  if (!isAuthenticated.value && !isLoading.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (!hasRole(PERMISSIONS.MANAGEMENT)) {
    return navigateTo({ path: '/agency', query: { error: 'no-management-access' } })
  }
})
