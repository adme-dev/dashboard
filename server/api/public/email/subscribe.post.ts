// POST /api/public/email/subscribe  { email, name?, listId }
// Public marketing signup form handler. Upserts the subscriber + list membership.
// For a double-opt-in list it sends a confirmation email (best-effort) and the
// membership stays 'unconfirmed' until the recipient clicks through.
import { z } from 'zod'
import { getAppUrl } from '~~/server/utils/appUrl'
import { sendDoubleOptInEmail } from '~~/server/utils/email'
import { normalizeSubscriberEmail } from '~~/server/utils/email-marketing/email'
import { emailLinkSecret, signEmailToken } from '~~/server/utils/email-marketing/links'
import { subscribePublic } from '~~/server/utils/email-marketing/subscriptions'
import { isTurnstileEnabled, verifyTurnstile } from '~~/server/utils/turnstile'

const EmailInput = z.preprocess(
  value => typeof value === 'string' ? value.trim() : value,
  z.string().email().max(300)
)

const Body = z.object({
  email: EmailInput,
  name: z.string().max(200).optional().nullable(),
  listId: z.string().uuid(),
  turnstileToken: z.string().max(2048).optional()
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { email, name, listId, turnstileToken } = parsed.data
  const normalizedEmail = normalizeSubscriberEmail(email)

  // Bot / abuse protection. No-op until the operator configures Turnstile
  // (TURNSTILE_SECRET_KEY) — see server/utils/turnstile.ts. Once enabled it
  // gates this unauthenticated endpoint so it can't be scripted to mail-bomb
  // arbitrary addresses with confirm emails.
  if (isTurnstileEnabled()) {
    const ip = getRequestHeader(event, 'cf-connecting-ip') || getRequestHeader(event, 'x-forwarded-for')
    const ok = await verifyTurnstile(turnstileToken, ip?.split(',')[0]?.trim())
    if (!ok) throw createError({ statusCode: 403, statusMessage: 'captcha_failed' })
  }

  const result = await subscribePublic({ email: normalizedEmail, name, listId, source: 'form' })

  if (result.needsConfirm) {
    const token = await signEmailToken(emailLinkSecret(), 'confirm', result.subscriberId, result.listId)
    const base = getAppUrl(event).replace(/\/+$/, '')
    const confirmUrl = `${base}/email/confirm?s=${result.subscriberId}&l=${result.listId}&t=${token}`
    // Best-effort — sendDoubleOptInEmail no-ops when Resend isn't configured.
    await sendDoubleOptInEmail({ to: normalizedEmail, listName: result.listName, confirmUrl })
  }

  return {
    ok: true,
    needsConfirm: result.needsConfirm,
    status: result.status,
    listName: result.listName
  }
})
