export default defineEventHandler(async (event) => {
  // Clear all auth cookies
  deleteCookie(event, 'auth_token')
  deleteCookie(event, 'auth_token_client')
  deleteCookie(event, 'auth_status')

  return {
    success: true,
    message: 'Logged out successfully'
  }
})
