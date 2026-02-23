/**
 * Test cookie functionality
 * GET /api/test/cookies
 */

import { getCookie, setCookie, getHeader } from 'h3'

export default defineEventHandler(async (event) => {
  const headers = getHeader(event, 'cookie') || 'none'
  const authToken = getCookie(event, 'auth_token') || 'not set'
  const authStatus = getCookie(event, 'auth_status') || 'not set'
  
  // Set a test cookie
  setCookie(event, 'test_cookie', 'works', {
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/'
  })
  
  return {
    receivedCookies: headers,
    authTokenPresent: authToken !== 'not set',
    authTokenPreview: authToken !== 'not set' ? authToken.substring(0, 20) + '...' : 'none',
    authStatus,
    testCookieSet: true
  }
})
