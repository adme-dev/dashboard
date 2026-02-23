/**
 * Debug magic link flow
 * POST /api/admin/magic-link-debug
 * Body: { email: string }
 */

import { readBody, createError } from 'h3'
import { getUserByEmail, generateMagicLink } from '../../utils/auth'
import { sendMagicLinkEmail } from '../../utils/email'

export default defineEventHandler(async (event) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Not allowed in production'
    })
  }

  const body = await readBody(event)
  const { email } = body

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const debug: any = {
    email: normalizedEmail,
    env: {
      nodeEnv: process.env.NODE_ENV,
      appUrl: process.env.APP_URL || useRuntimeConfig().public.appUrl,
      hasResendKey: !!process.env.RESEND_API_KEY,
      emailFrom: process.env.EMAIL_FROM
    },
    steps: []
  }

  try {
    // Step 1: Find user
    const user = await getUserByEmail(normalizedEmail)
    debug.steps.push({ step: 'Find user', user: user ? { id: user.id, email: user.email, role: user.role, is_active: user.is_active } : null })

    if (!user) {
      debug.error = 'User not found - magic link will not be sent (security feature)'
      return debug
    }

    if (!user.is_active) {
      debug.error = 'User is inactive'
      return debug
    }

    // Step 2: Generate token
    const token = await generateMagicLink(user.id, user.email)
    debug.steps.push({ step: 'Generate token', token: token.substring(0, 10) + '...' })

    // Step 3: Build URL
    const config = useRuntimeConfig()
    const appUrl = config.public.appUrl || 'http://localhost:3000'
    const magicLinkUrl = `${appUrl}/auth/magic-link?token=${token}`
    debug.steps.push({ step: 'Build URL', url: magicLinkUrl })

    // Step 4: Send email
    try {
      await sendMagicLinkEmail({
        to: user.email,
        name: user.name,
        magicLinkUrl
      })
      debug.steps.push({ step: 'Send email', status: 'success' })
    } catch (emailError: any) {
      debug.steps.push({ step: 'Send email', status: 'failed', error: emailError.message })
      debug.error = `Email failed: ${emailError.message}`
    }

    debug.devLink = magicLinkUrl
    return debug
  } catch (error: any) {
    debug.error = error.message
    return debug
  }
})
