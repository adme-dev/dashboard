// POST /api/public/email/subscribe  { email, name?, listId }
// Public marketing signup form handler. Upserts the subscriber + list membership.
// For a double-opt-in list it sends a confirmation email (best-effort) and the
// membership stays 'unconfirmed' until the recipient clicks through.
import { z } from 'zod'
import { getAppUrl, sendDoubleOptInEmail } from '~~/server/utils/email'
import { emailLinkSecret, signEmailToken } from '~~/server/utils/email-marketing/links'
import { subscribePublic } from '~~/server/utils/email-marketing/subscriptions'

const Body = z.object({
  email: z.string().email().max(300),
  name: z.string().max(200).optional().nullable(),
  listId: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { email, name, listId } = parsed.data

  const result = await subscribePublic({ email, name, listId, source: 'form' })

  if (result.needsConfirm) {
    const token = await signEmailToken(emailLinkSecret(), 'confirm', result.subscriberId, result.listId)
    const base = getAppUrl(event).replace(/\/+$/, '')
    const confirmUrl = `${base}/email/confirm?s=${result.subscriberId}&l=${result.listId}&t=${token}`
    // Best-effort — sendDoubleOptInEmail no-ops when Resend isn't configured.
    await sendDoubleOptInEmail({ to: email, listName: result.listName, confirmUrl })
  }

  return {
    ok: true,
    needsConfirm: result.needsConfirm,
    status: result.status,
    listName: result.listName
  }
})
