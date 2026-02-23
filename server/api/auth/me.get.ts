import { validateSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    // Get token from cookie
    const token = getCookie(event, 'auth_token')
    
    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Not authenticated'
      })
    }

    // Validate session
    const user = await validateSession(token)
    
    if (!user) {
      // Clear invalid cookie
      deleteCookie(event, 'auth_token')
      throw createError({
        statusCode: 401,
        statusMessage: 'Session expired'
      })
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    }
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to get user'
    })
  }
})
