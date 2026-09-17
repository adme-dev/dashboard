import { revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'

export default defineEventHandler(async (event) => {
  await revokePageStudioLoginSession(event, 'agency')
  deleteCookie(event, 'auth_token', { path: '/' })
  deleteCookie(event, 'auth_token_client', { path: '/' })
  deleteCookie(event, 'auth_status', { path: '/' })
  return { success: true, message: 'Logged out successfully' }
})
