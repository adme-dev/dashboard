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

    // Create JWT
    const token = await createJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Date.now()
    })

    // Set HTTP-only cookie
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })

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
