// POST /api/public/email/unsubscribe  { c, s, t }
// Public, token-gated one-click unsubscribe — the endpoint the unsubscribe
// page's button calls. The mailbox-client RFC 8058 one-click path lives at
// server/routes/email/unsubscribe.post.ts; both funnel through globalUnsubscribe.
import { z } from 'zod'
import { emailLinkSecret, verifyEmailToken } from '~~/server/utils/email-marketing/links'
import { globalUnsubscribe } from '~~/server/utils/email-marketing/subscriptions'

const Body = z.object({
  c: z.string().min(1),
  s: z.string().min(1),
  t: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { c, s, t } = parsed.data

  const valid = await verifyEmailToken(emailLinkSecret(), t, 'unsub', c, s)
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'invalid_token' })

  const res = await globalUnsubscribe({ subscriberId: s, campaignId: c })
  if (!res) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  return { ok: true, email: res.email }
})
