// server/api/email/suppressions/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { recordSuppressionEvent } from '~~/server/utils/email-marketing/audit'
import { isValidEmail, normalizeSubscriberEmail } from '~~/server/utils/email-marketing/email'

const Body = z.object({
  email: z.string().min(1),
  note: z.string().max(2000).optional().nullable(),
  reason: z.literal('manual').default('manual')
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (!isValidEmail(parsed.data.email)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email' })
  }

  const email = normalizeSubscriberEmail(parsed.data.email)
  const subscriber = await queryOne<{ id: string, email: string, client_id: string | null }>(
    'SELECT id, email, client_id FROM email_subscribers WHERE email = $1',
    [email]
  )
  await assertEmailClientAccess(event, user, subscriber?.client_id ?? null)
  const existing = await queryOne<{ email: string, reason: string }>(
    'SELECT email::text, reason FROM suppression_list WHERE email = $1',
    [email]
  )

  const action = existing ? 'ignored' : 'added'
  if (!existing) {
    await execute(`
      INSERT INTO suppression_list (email, reason)
      VALUES ($1, $2)
    `, [email, parsed.data.reason])
  }

  await recordSuppressionEvent({
    email,
    subscriberId: subscriber?.id ?? null,
    reason: 'manual',
    action,
    source: 'manual',
    actorUserId: user.id,
    metadata: {
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      ...(existing ? { existingReason: existing.reason } : {})
    }
  })

  return { ok: true, email, action }
})
