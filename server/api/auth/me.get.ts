import { validateSession, TransientAuthError } from '../../utils/auth'
import { resolveUserPermissions } from '../../utils/roleResolver'

export default defineEventHandler(async (event) => {
  // Get token from cookie (httpOnly primary, client-visible fallback)
  const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated'
    })
  }

  try {
    // Validate session
    const user = await validateSession(token)

    if (!user) {
      // Token is genuinely invalid — clear all cookies
      deleteCookie(event, 'auth_token')
      deleteCookie(event, 'auth_token_client')
      deleteCookie(event, 'auth_status')
      throw createError({
        statusCode: 401,
        statusMessage: 'Session expired'
      })
    }

    // Resolve permission groups
    const resolved = await resolveUserPermissions(event, user.id, user.role, user.custom_role_id)

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        custom_role_id: user.custom_role_id || null,
        permissionGroups: resolved.groups
      }
    }
  } catch (error: any) {
    // Re-throw HTTP errors (our own 401 above)
    if (error.statusCode) throw error

    // Transient DB error — return 503, do NOT clear cookies
    if (error instanceof TransientAuthError || error.name === 'TransientAuthError') {
      console.error('[Auth /me] Transient DB error:', error.message)
      throw createError({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable'
      })
    }

    console.error('[Auth /me] Unexpected error:', error?.name, error?.message, error?.code, typeof error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get user: ${error?.message || 'unknown'}`
    })
  }
})
