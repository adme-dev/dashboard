import { getUserByEmail, verifyPassword, createJwt } from '../../utils/auth'
import { queryOne } from '../../utils/db'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { email, password } = body

    // Validation
    if (!email || !password) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Email and password are required'
      })
    }

    // Get user
    const user = await getUserByEmail(email)
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }

    if (!user.is_active) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Account is deactivated'
      })
    }

    // Get password hash
    const userWithPassword = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM team_members WHERE id = $1`,
      [user.id]
    )

    if (!userWithPassword?.password_hash) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }

    // Verify password
    const isValid = await verifyPassword(password, userWithPassword.password_hash)
    if (!isValid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }

    // Create JWT (iat/exp are added automatically by createJwt)
    const token = await createJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    const isSecure = getRequestURL(event).protocol === 'https:'
    const cookieOpts = {
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    }

    // Main auth token (httpOnly for security)
    setCookie(event, 'auth_token', token, { ...cookieOpts, httpOnly: true })
    // Client-visible flag for auth detection
    setCookie(event, 'auth_status', 'logged_in', { ...cookieOpts, httpOnly: false })
    // Client-accessible token fallback
    setCookie(event, 'auth_token_client', token, { ...cookieOpts, httpOnly: false })

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
      statusMessage: error.statusMessage || 'Login failed'
    })
  }
})
