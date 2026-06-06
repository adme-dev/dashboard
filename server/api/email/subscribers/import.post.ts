// server/api/email/subscribers/import.post.ts
// Bulk-import subscribers from raw CSV text, upsert them, and add them to a
// target list. Reuses the pure parseSubscriberCsv mapping (unit-tested).

import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess, isAgencyEmailUser, resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import { parseSubscriberCsv } from '~~/server/utils/email-marketing/importParse'
import { upsertSubscriber, addToList, getList } from '~~/server/utils/email-marketing/db'
import { queryRows } from '~~/server/utils/db'

const Body = z.object({
  list_id: z.string().uuid(),
  csv: z.string().min(1),
  client_id: z.string().uuid().optional().nullable(),
  column_mapping: z.record(z.string(), z.string()).optional()
})

interface ImportCandidateState {
  email: string
  client_id: string | null
  subscriber_status: string | null
  membership_status: string | null
  suppression_reason: string | null
}

interface ImportReview {
  valid_rows: number
  invalid_rows: number
  duplicate_rows: number
  previously_unsubscribed: number
  suppressed: number
  blocklisted: number
}

async function loadImportCandidateStates(emails: string[], listId: string): Promise<ImportCandidateState[]> {
  if (!emails.length) return []
  return queryRows<ImportCandidateState>(`
    SELECT
      s.email::text AS email,
      s.client_id,
      s.status::text AS subscriber_status,
      sl.status::text AS membership_status,
      sup.reason::text AS suppression_reason
    FROM email_subscribers s
    LEFT JOIN subscriber_lists sl ON sl.subscriber_id = s.id AND sl.list_id = $2
    LEFT JOIN suppression_list sup ON sup.email = s.email
    WHERE s.email = ANY($1::citext[])
  `, [emails, listId])
}

function buildImportReview(input: {
  validRows: number
  errors: Array<{ message: string }>
  candidateStates: ImportCandidateState[]
}): ImportReview {
  return {
    valid_rows: input.validRows,
    invalid_rows: input.errors.filter(error => error.message === 'invalid_email').length,
    duplicate_rows: input.errors.filter(error => error.message === 'duplicate_in_file').length,
    previously_unsubscribed: input.candidateStates.filter(row => row.membership_status === 'unsubscribed').length,
    suppressed: input.candidateStates.filter(row => !!row.suppression_reason).length,
    blocklisted: input.candidateStates.filter(row => row.subscriber_status === 'blocklisted').length
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const input = parsed.data

  const list = await getList(input.list_id)
  if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })
  await assertEmailClientAccess(event, user, list.client_id)
  const requestedClientId = input.client_id ?? list.client_id
  if (!isAgencyEmailUser(user) && requestedClientId !== list.client_id) {
    throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
  }
  const clientId = await resolveEmailWriteClientId(event, user, requestedClientId)

  const { subscribers, errors } = parseSubscriberCsv(input.csv, input.column_mapping)
  if (!subscribers.length && errors.length === 1 && errors[0].row === 0) {
    // Structural error (empty_csv / no_email_column) — surface as 400.
    throw createError({ statusCode: 400, statusMessage: errors[0].message })
  }

  const candidateStates = await loadImportCandidateStates(
    subscribers.map(subscriber => subscriber.email),
    input.list_id
  )
  if (!isAgencyEmailUser(user) && candidateStates.some(row => row.client_id !== list.client_id)) {
    throw createError({ statusCode: 403, statusMessage: 'email_list_client_mismatch' })
  }
  const review = buildImportReview({
    validRows: subscribers.length,
    errors,
    candidateStates
  })

  let imported = 0
  for (const s of subscribers) {
    const id = await upsertSubscriber({
      email: s.email,
      name: s.name ?? null,
      attribs: s.attribs ?? {},
      client_id: clientId,
      created_by: user.id
    })
    await addToList(id, input.list_id, 'import', {
      actorUserId: user.id,
      email: s.email,
      metadata: {
        source: 'csv_upload',
        importTotal: subscribers.length,
        skippedRows: errors.length
      }
    })
    imported++
  }

  return { imported, skipped: errors.length, errors, review }
})
