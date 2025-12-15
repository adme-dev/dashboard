/**
 * Sales Middleware
 * Protects routes that require sales/pricing access
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  const { user, fetchUser, initialized, canAccessPricing } = useAuth()

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

  // Check if user can access pricing/sales pages
  if (!canAccessPricing.value) {
    // Redirect to main dashboard with error toast
    return navigateTo({
      path: '/agency',
      query: { error: 'no-sales-access' }
    })
  }
})
