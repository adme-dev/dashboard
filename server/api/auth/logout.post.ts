/**
 * User Logout
 * POST /api/auth/logout
 */

import { invalidateSession, getAuthUser, logActivity } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getAuthUser(event)

  // Get token from cookie or header
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : getCookie(event, 'auth_token')

  if (token) {
    await invalidateSession(token)
  }

  // Clear auth cookie
  deleteCookie(event, 'auth_token', {
    path: '/'
  })

  // Log activity if we know the user
  if (user) {
    await logActivity({
      userId: user.id,
      action: 'logout',
      resourceType: 'user',
      resourceId: user.id,
      event
    })
  }

  return { success: true }
})
