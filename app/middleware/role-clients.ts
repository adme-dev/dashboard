/**
 * Clients Route Middleware
 * Protects routes that require CLIENTS access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isAuthenticated, fetchUser, isLoading, hasRole } = useAuth()

  if (!isAuthenticated.value && !isLoading.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (!hasRole(PERMISSIONS.CLIENTS)) {
    return navigateTo({ path: '/agency', query: { error: 'no-clients-access' } })
  }
})
