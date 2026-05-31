// POST /api/public/email/preferences  { c, s, t, listId, subscribe }
// Public, token-gated preference-center toggle. Reuses the unsubscribe link's
// signed token (over campaign + subscriber) as the authorization to manage that
// subscriber's per-list memberships.
import { z } from 'zod'
import { emailLinkSecret, verifyEmailToken } from '~~/server/utils/email-marketing/links'
import { setListSubscription } from '~~/server/utils/email-marketing/subscriptions'

const Body = z.object({
  c: z.string().min(1),
  s: z.string().min(1),
  t: z.string().min(1),
  listId: z.string().uuid(),
  subscribe: z.boolean()
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { c, s, t, listId, subscribe } = parsed.data

  const valid = await verifyEmailToken(emailLinkSecret(), t, 'unsub', c, s)
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'invalid_token' })

  const changed = await setListSubscription({ subscriberId: s, listId, subscribe })
  return { ok: true, changed }
})
