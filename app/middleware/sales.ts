/**
 * Sales Middleware
 * Protects routes that require sales/pricing access
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  const { user, isAuthenticated, fetchUser, isLoading, hasRole } = useAuth()

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

  // Check if user can access pricing/sales pages
  const canAccessPricing = hasRole(['admin', 'owner', 'project_manager', 'sales'])
  if (!canAccessPricing) {
    return navigateTo({
      path: '/agency',
      query: { error: 'no-sales-access' }
    })
  }
})
