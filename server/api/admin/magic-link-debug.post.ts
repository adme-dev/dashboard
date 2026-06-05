/**
 * Debug magic link flow
 * POST /api/admin/magic-link-debug
 * Body: { email: string }
 *
 * In dev: unrestricted. In production: requires admin auth.
 */

import { readBody, createError } from 'h3'
import { getUserByEmail, generateMagicLink, requireRole } from '../../utils/auth'
import { getAppUrl } from '../../utils/appUrl'
import { sendMagicLinkEmail, isEmailConfigured } from '../../utils/email'

export default defineEventHandler(async (event) => {
  // In production, require admin role
  if (!import.meta.dev) {
    await requireRole(event, ['admin', 'owner'])
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
  const config = useRuntimeConfig()
  const cfEnv = (event.context as any).cloudflare?.env
  const debug: any = {
    email: normalizedEmail,
    env: {
      nodeEnv: process.env.NODE_ENV,
      appUrl: config.public.appUrl,
      emailConfigured: isEmailConfigured(event),
      hasResendKeyInCfBindings: !!cfEnv?.RESEND_API_KEY,
      hasResendKeyInConfig: !!config.resendApiKey,
      hasResendKeyInProcessEnv: !!process.env.RESEND_API_KEY,
      emailFromCfBindings: cfEnv?.EMAIL_FROM || '(not set)',
      emailFromConfig: config.emailFrom || '(not set)',
      emailFromProcessEnv: process.env.EMAIL_FROM || '(not set)',
      hasCfBindings: !!cfEnv,
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

    // Step 3: Build URL from the canonical app origin.
    const appUrl = getAppUrl(event).replace(/\/$/, '')
    const magicLinkUrl = `${appUrl}/auth/magic-link?token=${token}`
    debug.steps.push({ step: 'Build URL', url: magicLinkUrl })

    // Step 4: Send email
    try {
      await sendMagicLinkEmail({
        to: user.email,
        name: user.name,
        magicLinkUrl,
        event
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
