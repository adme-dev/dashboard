/**
 * Request a magic link
 * POST /api/auth/magic-link/request
 * Body: { email: string }
 */

import { readBody, createError, getRequestURL } from 'h3'
import { getUserByEmail, generateMagicLink } from '../../../utils/auth'
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
  console.log('[Magic Link] Step 1 — email configured:', emailReady)

  if (!emailReady && !import.meta.dev) {
    console.error('[Magic Link] Email service not configured — RESEND_API_KEY missing')
    throw createError({
      statusCode: 503,
      statusMessage: 'Email service is not configured. Please contact your administrator.'
    })
  }

  // Find user by email
  const user = await getUserByEmail(normalizedEmail)
  console.log('[Magic Link] Step 2 — user lookup for', normalizedEmail, '→', user ? `found (id=${user.id}, active=${user.is_active})` : 'NOT FOUND')

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
    console.log('[Magic Link] User is inactive, skipping email')
    return {
      success: true,
      message: 'If an account exists with this email, a magic link has been sent.'
    }
  }

  try {
    // Generate magic link token
    const token = await generateMagicLink(user.id, user.email)
    console.log('[Magic Link] Step 3 — token generated')

    // Derive the app URL from the incoming request (works for any deployment)
    const reqUrl = getRequestURL(event)
    const appUrl = `${reqUrl.protocol}//${reqUrl.host}`

    // Build magic link URL
    const magicLinkUrl = `${appUrl}/auth/magic-link?token=${token}`
    console.log('[Magic Link] Step 4 — URL:', magicLinkUrl)

    // Send email — let errors propagate so user knows something went wrong
    console.log('[Magic Link] Step 5 — sending email to', user.email)
    await sendMagicLinkEmail({
      to: user.email,
      name: user.name,
      magicLinkUrl,
      event
    })
    console.log('[Magic Link] Step 6 — email sent successfully')

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
