// server/api/email/suppressions/[email].delete.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { assertEmailClientAccess, isAgencyEmailUser } from '~~/server/utils/email-marketing/access'
import { recordSuppressionEvent } from '~~/server/utils/email-marketing/audit'
import { isValidEmail, normalizeSubscriberEmail } from '~~/server/utils/email-marketing/email'
import type { SuppressionReason } from '~~/server/utils/email-marketing/types'

const Body = z.object({
  confirm: z.boolean().optional(),
  note: z.string().max(2000).optional().nullable()
})

const CONFIRMATION_REQUIRED = new Set<SuppressionReason>(['hard_bounce', 'complaint'])

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const rawEmail = getRouterParam(event, 'email')
  if (!rawEmail) throw createError({ statusCode: 400, statusMessage: 'missing_email' })

  let decodedEmail = rawEmail
  try {
    decodedEmail = decodeURIComponent(rawEmail)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email' })
  }
  if (!isValidEmail(decodedEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email' })
  }

  const parsed = Body.safeParse((await readBody(event)) ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }

  const email = normalizeSubscriberEmail(decodedEmail)
  const current = await queryOne<{ email: string, reason: SuppressionReason }>(
    'SELECT email::text, reason FROM suppression_list WHERE email = $1',
    [email]
  )
  if (!current) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  const subscriber = await queryOne<{ id: string, email: string, client_id: string | null }>(
    'SELECT id, email, client_id FROM email_subscribers WHERE email = $1',
    [email]
  )
  await assertEmailClientAccess(event, user, subscriber?.client_id ?? null)

  if (CONFIRMATION_REQUIRED.has(current.reason)) {
    if (!isAgencyEmailUser(user)) {
      throw createError({ statusCode: 403, statusMessage: 'suppression_removal_admin_required' })
    }
    if (!parsed.data.confirm) {
      throw createError({ statusCode: 409, statusMessage: 'suppression_removal_requires_confirmation' })
    }
  }
  const note = parsed.data.note?.trim() ?? ''
  if (!note) {
    throw createError({ statusCode: 400, statusMessage: 'suppression_note_required' })
  }

  await execute('DELETE FROM suppression_list WHERE email = $1', [email])
  await recordSuppressionEvent({
    email,
    subscriberId: subscriber?.id ?? null,
    reason: current.reason,
    action: 'removed',
    source: 'manual',
    actorUserId: user.id,
    metadata: {
      note,
      confirmed: parsed.data.confirm === true
    }
  })

  return { ok: true, email, removed: true }
})
