/**
 * Guest Middleware
 * Redirects authenticated users away from auth pages
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  const { user, fetchUser, initialized } = useAuth()

  // Fetch user if not initialized
  if (!initialized.value) {
    await fetchUser()
  }

  // Redirect to home if already authenticated
  if (user.value) {
    const redirect = to.query.redirect as string
    return navigateTo(redirect || '/')
  }
})
