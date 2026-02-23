/**
 * Global authentication error handler plugin
 * Redirects to login on 401 errors instead of showing error messages
 */

export default defineNuxtPlugin((nuxtApp) => {
  // Add fetch interceptor for client-side
  if (process.client) {
    const router = useRouter()
    
    // Intercept fetch errors
    nuxtApp.hook('app:error', (error: any) => {
      // Check if it's a 401 error
      if (error?.statusCode === 401 || error?.response?.status === 401) {
        console.log('Auth error intercepted, redirecting to login...')
        
        // Get current path for redirect after login
        const currentPath = window.location.pathname
        const isAgency = currentPath.startsWith('/agency') || currentPath.startsWith('/admin')
        const isXero = currentPath.startsWith('/dashboard') || currentPath.startsWith('/implementations')
        
        // Clear auth state
        const { user } = useAuth()
        user.value = null
        
        // Redirect to appropriate login based on current path
        if (isAgency) {
          router.push(`/auth/login?redirect=${encodeURIComponent(currentPath)}&expired=true`)
        } else if (isXero) {
          router.push(`/auth/xeroflow?redirect=${encodeURIComponent(currentPath)}&expired=true`)
        } else {
          router.push(`/login?redirect=${encodeURIComponent(currentPath)}&expired=true`)
        }
      }
    })
  }
})
