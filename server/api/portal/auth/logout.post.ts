import { revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'

export default defineEventHandler(async (event) => {
  await revokePageStudioLoginSession(event, 'client')
  deleteCookie(event, 'client_session_token', { path: '/' })
  return { success: true, message: 'Logged out successfully' }
})
