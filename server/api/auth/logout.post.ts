export default defineEventHandler(async (event) => {
  // Clear the auth cookie
  deleteCookie(event, 'auth_token')
  
  return {
    success: true,
    message: 'Logged out successfully'
  }
})
