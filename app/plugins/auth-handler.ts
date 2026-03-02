/**
 * Global authentication error handler plugin
 * Intercepts 401 responses and redirects to login — but ONLY after
 * confirming the session is truly dead (avoids false logouts from
 * transient errors or individual endpoint failures).
 */

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client) return

  const router = useRouter()

  // Flags to prevent redirect loops and duplicate verification
  let isRedirecting = false
  let isVerifyingSession = false

  async function verifyAndRedirect() {
    if (isRedirecting || isVerifyingSession) return
    isVerifyingSession = true

    try {
      // Double-check: is the session actually dead?
      // /api/auth/me is a public route — it reads the httpOnly cookie server-side.
      const me: any = await $fetch('/api/auth/me').catch((err: any) => {
        // 503 = transient error (DB down, cold start) — don't treat as dead session
        if (err?.statusCode === 503 || err?.status === 503) {
          return { _transient: true }
        }
        return null
      })
      if (me?.user || me?._transient) {
        console.log('[Auth Handler] Session valid or transient error, ignoring 401')
        return
      }
    } catch {
      // If /api/auth/me itself fails unexpectedly, the session is dead
    } finally {
      isVerifyingSession = false
    }

    redirectToLogin()
  }

  function redirectToLogin() {
    if (isRedirecting) return

    const currentPath = window.location.pathname

    // Don't intercept 401s on auth pages — they handle their own errors
    if (currentPath.startsWith('/auth/') || currentPath.startsWith('/portal/')) return

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
      router.push(`/auth/login?redirect=${redirect}&expired=true`)
    }

    // Reset after navigation settles
    setTimeout(() => { isRedirecting = false }, 2000)
  }

  // Catch unhandled 401 errors via app:error hook
  nuxtApp.hook('app:error', (error: any) => {
    const status = error?.statusCode || error?.response?.status
    // Only react to 401 (Unauthorized), never to 403 (Forbidden) or 503 (transient)
    if (status === 401) {
      verifyAndRedirect()
    }
  })

  // Also hook into Vue's global error handler for uncaught 401s
  nuxtApp.hook('vue:error', (error: any) => {
    const status = error?.statusCode || error?.data?.statusCode
    if (status === 401) {
      verifyAndRedirect()
    }
  })
})
