/**
 * Request a magic link
 * POST /api/auth/magic-link/request
 * Body: { email: string }
 */

import { readBody, createError } from 'h3'
import { getUserByEmail, generateMagicLink } from '../../../utils/auth'
import { getAppUrl } from '../../../utils/appUrl'
import { sendMagicLinkEmail, isMagicLinkEmailConfigured } from '../../../utils/email'

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
  const emailReady = isMagicLinkEmailConfigured(event)

  if (!emailReady && !import.meta.dev) {
    console.error('[Magic Link] Magic-link Cloudflare email service not configured')
    throw createError({
      statusCode: 503,
      statusMessage: 'Email service is not configured. Please contact your administrator.'
    })
  }

  const response = {
    success: true,
    message: 'If an account exists with this email, sign-in instructions will be sent.'
  }

  // Find user by email
  const user = await getUserByEmail(normalizedEmail)

  // Always return success to prevent email enumeration
  // But only actually send if user exists
  if (!user) {
    return response
  }

  // Check if user is active
  if (!user.is_active) {
    return response
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

    // Only accepted delivery succeeds internally; the public response stays generic.
    await sendMagicLinkEmail({
      to: user.email,
      name: user.name,
      magicLinkUrl,
      event
    })

    return {
      ...response,
      // In development only, return the link
      ...(import.meta.dev && {
        devLink: magicLinkUrl
      })
    }
  } catch {
    console.error('[Magic Link] Request delivery failed', { code: 'agency_auth_email_failed' })
    return response
  }
})
