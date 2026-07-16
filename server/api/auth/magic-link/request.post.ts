/**
 * Request a magic link
 * POST /api/auth/magic-link/request
 * Body: { email: string }
 */

import { readBody, createError } from 'h3'
import { getUserByEmail, generateMagicLink } from '../../../utils/auth'
import { getAppUrl } from '../../../utils/appUrl'
import { sendMagicLinkEmail, isEmailConfigured } from '../../../utils/email'

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

  // Check email service availability upfront (doesn't reveal user existence)
  const emailReady = isEmailConfigured(event)

  if (!emailReady && !import.meta.dev) {
    console.error('[Magic Link] Email service not configured — RESEND_API_KEY missing')
    throw createError({
      statusCode: 503,
      statusMessage: 'Email service is not configured. Please contact your administrator.'
    })
  }

  // Find user by email
  const user = await getUserByEmail(normalizedEmail)

  // Always return success to prevent email enumeration
  // But only actually send if user exists
  if (!user) {
    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.'
    }
  }

  // Check if user is active
  if (!user.is_active) {
    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.'
    }
  }

  try {
    // Generate magic link token
    const token = await generateMagicLink(user.id, user.email)

    // Use the canonical app URL so magic links always land on the admin host.
    const appUrl = getAppUrl(event).replace(/\/$/, '')

    // Build magic link URL — the SERVER-SIDE callback, not the client page.
    // The client page (/auth/magic-link) verifies via XHR in onMounted, so
    // in mail-app webviews or with a stale JS chunk it rendered nothing but
    // a blank dark background. The callback sets cookies on a 302 redirect
    // and works with zero JavaScript.
    const magicLinkUrl = `${appUrl}/api/auth/magic-link/callback?token=${token}`

    // Send email — let errors propagate so user knows something went wrong
    await sendMagicLinkEmail({
      to: user.email,
      name: user.name,
      magicLinkUrl,
      event
    })

    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.',
      // In development only, return the link
      ...(import.meta.dev && {
        devLink: magicLinkUrl
      })
    }
  } catch (error: any) {
    console.error('[Magic Link] Failed at step 5/6:', error)
    // Don't expose internal details but signal that email delivery failed
    throw createError({
      statusCode: 502,
      statusMessage: 'Unable to send magic link email. Please try again or contact your administrator.'
    })
  }
})
