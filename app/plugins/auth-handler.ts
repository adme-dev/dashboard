/**
 * Global authentication error handler plugin
 * Intercepts 401 responses and redirects to login
 */

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client) return

  const router = useRouter()

  // Flag to prevent redirect loops
  let isRedirecting = false

  function redirectToLogin() {
    if (isRedirecting) return

    const currentPath = window.location.pathname

    // Don't intercept 401s on auth pages — they handle their own errors
    if (currentPath.startsWith('/auth/')) return

    isRedirecting = true
    const isAgency = currentPath.startsWith('/agency') || currentPath.startsWith('/admin')

    // Clear auth cookies
    document.cookie = 'auth_token=; path=/; max-age=0'
    document.cookie = 'auth_token_client=; path=/; max-age=0'
    document.cookie = 'auth_status=; path=/; max-age=0'

    const redirect = encodeURIComponent(currentPath)
    if (isAgency) {
      router.push(`/auth/login?redirect=${redirect}&expired=true`)
    } else {
      router.push(`/login?redirect=${redirect}&expired=true`)
    }

    // Reset after navigation settles
    setTimeout(() => { isRedirecting = false }, 2000)
  }

  // Catch unhandled 401 errors via app:error hook
  // This avoids replacing $fetch which breaks Nuxt's built-in cookie handling
  nuxtApp.hook('app:error', (error: any) => {
    if (error?.statusCode === 401 || error?.response?.status === 401) {
      redirectToLogin()
    }
  })

  // Also hook into Vue's global error handler for uncaught 401s
  nuxtApp.hook('vue:error', (error: any) => {
    if (error?.statusCode === 401 || error?.data?.statusCode === 401) {
      redirectToLogin()
    }
  })
})
