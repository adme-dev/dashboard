// POST /api/public/email/confirm  { s, l, t }
// Public, token-gated double-opt-in confirmation. The confirm link emailed at
// subscribe time signs (subscriberId, listId) under the 'confirm' purpose, so an
// unsubscribe token can never be replayed here.
import { z } from 'zod'
import { emailLinkSecret, verifyEmailToken } from '~~/server/utils/email-marketing/links'
import { confirmSubscription } from '~~/server/utils/email-marketing/subscriptions'

const Body = z.object({
  s: z.string().min(1),
  l: z.string().min(1),
  t: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { s, l, t } = parsed.data

  const valid = await verifyEmailToken(emailLinkSecret(), t, 'confirm', s, l)
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'invalid_token' })

  const confirmed = await confirmSubscription({ subscriberId: s, listId: l })
  return { ok: true, confirmed }
})
