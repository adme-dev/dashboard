// server/api/webhooks/resend.post.ts
// Phase 3: Resend delivery/engagement webhook receiver. Public (no session) but
// signature-verified via Svix (Resend's webhook signer) using RESEND_WEBHOOK_SECRET.
// RBAC/auth-exempt via the /api/webhooks/ prefix in server/middleware/auth.ts.
// Idempotent on the Svix message id. Returns fast; processing is light.
import { Webhook } from 'svix'
import { setCfBindings, getCachedBinding } from '~~/server/utils/email'
import { handleResendEvent, type ResendWebhookPayload } from '~~/server/utils/email-marketing/resendEvents'

export default defineEventHandler(async (event) => {
  // Surface CF bindings so the signing secret resolves outside an authed context.
  setCfBindings((event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env)
  const secret = process.env.RESEND_WEBHOOK_SECRET || getCachedBinding('RESEND_WEBHOOK_SECRET')
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'webhook_not_configured' })
  }

  // Svix verification requires the exact raw request body.
  const raw = await readRawBody(event, 'utf8')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'empty_body' })

  const headers = {
    'svix-id': getHeader(event, 'svix-id') || '',
    'svix-timestamp': getHeader(event, 'svix-timestamp') || '',
    'svix-signature': getHeader(event, 'svix-signature') || ''
  }
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    throw createError({ statusCode: 400, statusMessage: 'missing_svix_headers' })
  }

  let payload: ResendWebhookPayload
  try {
    payload = new Webhook(secret).verify(raw, headers) as ResendWebhookPayload
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'invalid_signature' })
  }

  const result = await handleResendEvent(payload, headers['svix-id'])
  return { ok: true, ...result }
})
