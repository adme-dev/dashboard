/**
 * Invoice Route Middleware
 * Protects routes that require INVOICE_OWN_CLIENTS access.
 * Allows account managers (scoped) and finance roles (full) to access billing.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isAuthenticated, fetchUser, isLoading, canAccessInvoices } = useAuth()

  if (!isAuthenticated.value && !isLoading.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (!canAccessInvoices.value) {
    return navigateTo({ path: '/agency', query: { error: 'no-invoice-access' } })
  }
})
