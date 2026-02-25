/**
 * Global authentication error handler plugin
 * Intercepts 401 responses from $fetch and redirects to login
 */
import { ofetch } from 'ofetch'

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client) return

  const router = useRouter()

  // Flag to prevent redirect loops
  let isRedirecting = false

  function redirectToLogin() {
    if (isRedirecting) return
    isRedirecting = true

    const currentPath = window.location.pathname
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

  // Override globalThis.$fetch to intercept 401 responses
  const originalFetch = globalThis.$fetch
  globalThis.$fetch = ofetch.create({
    onResponseError({ response }) {
      if (response.status === 401) {
        redirectToLogin()
      }
    },
  })

  // Also catch unhandled 401 errors via app:error
  nuxtApp.hook('app:error', (error: any) => {
    if (error?.statusCode === 401 || error?.response?.status === 401) {
      redirectToLogin()
    }
  })
})
