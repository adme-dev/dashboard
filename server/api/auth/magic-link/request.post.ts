/**
 * Request a magic link
 * POST /api/auth/magic-link/request
 * Body: { email: string }
 */

import { readBody, createError } from 'h3'
import { getUserByEmail, generateMagicLink } from '../../../utils/auth'
import { sendMagicLinkEmail } from '../../../utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email } = body

  if (!email || typeof email !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim()

  // Find user by email
  const user = await getUserByEmail(normalizedEmail)

  // Always return success to prevent email enumeration
  // But only actually send if user exists
  if (!user) {
    console.log(`Magic link requested for non-existent email: ${normalizedEmail}`)
    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.'
    }
  }

  // Check if user is active
  if (!user.is_active) {
    console.log(`Magic link requested for inactive user: ${normalizedEmail}`)
    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.'
    }
  }

  try {
    // Generate magic link token
    const token = await generateMagicLink(user.id, user.email)

    // Get the app URL
    const config = useRuntimeConfig()
    const appUrl = config.public.appUrl || 'http://localhost:3000'

    // Build magic link URL
    const magicLinkUrl = `${appUrl}/auth/magic-link?token=${token}`

    // Log for development
    console.log('[Magic Link]', user.email, magicLinkUrl)

    // Send email
    try {
      await sendMagicLinkEmail({
        to: user.email,
        name: user.name,
        magicLinkUrl
      })
    } catch (emailError) {
      console.error('[Magic Link] Email failed:', emailError)
      // Continue - still return success but log error
    }

    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.',
      // In development only, return the link
      ...(process.env.NODE_ENV === 'development' && {
        devLink: magicLinkUrl
      })
    }
  } catch (error) {
    console.error('Failed to generate magic link:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate magic link'
    })
  }
})
