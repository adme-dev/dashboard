/**
 * Client-side auth plugin
 * Sets up auth token from various sources
 */

export default defineNuxtPlugin(() => {
  // Only run on client
  if (process.server) return
  
  console.log('[Auth Plugin] Running on client')
  
  // Check if we have a client-accessible token
  const cookies = document.cookie.split(';')
  const tokenCookie = cookies.find(c => c.trim().startsWith('auth_token_client='))
  
  if (tokenCookie) {
    const token = tokenCookie.split('=')[1]
    console.log('[Auth Plugin] Found client token, storing in localStorage')
    localStorage.setItem('auth_token_backup', token)
    localStorage.setItem('auth_fallback', 'true')
  }
  
  // Check for auth_status cookie
  const statusCookie = cookies.find(c => c.trim().startsWith('auth_status='))
  if (statusCookie) {
    console.log('[Auth Plugin] Auth status:', statusCookie.split('=')[1])
  }
})
