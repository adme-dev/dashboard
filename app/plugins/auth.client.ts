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
  const statusCookie = cookies.find(c => c.trim().startsWith('auth_status='))
  
  if (tokenCookie) {
    const tokenRaw = tokenCookie.trim().slice('auth_token_client='.length)
    const token = (() => {
      try {
        return decodeURIComponent(tokenRaw)
      } catch {
        return tokenRaw
      }
    })()
    console.log('[Auth Plugin] Found client token, storing in localStorage')
    localStorage.setItem('auth_token_backup', token)
    localStorage.setItem('auth_fallback', 'true')
    localStorage.setItem('auth_status', 'logged_in')
  } else {
    localStorage.removeItem('auth_token_backup')
    localStorage.removeItem('auth_fallback')
  }
  if (statusCookie) {
    const status = statusCookie.trim().split('=')[1]
    console.log('[Auth Plugin] Auth status:', status)
    if (status !== 'logged_in') {
      localStorage.removeItem('auth_token_backup')
      localStorage.removeItem('auth_fallback')
      localStorage.removeItem('auth_status')
    } else {
      localStorage.setItem('auth_status', 'logged_in')
    }
  } else {
    localStorage.removeItem('auth_status')
    localStorage.removeItem('auth_token_backup')
    localStorage.removeItem('auth_fallback')
  }
})
