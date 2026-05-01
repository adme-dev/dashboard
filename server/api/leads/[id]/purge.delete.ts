import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { purgeLead } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')!
  // Best-effort redaction of raw payloads that may include this lead's source_lead_id
  await execute(
    `UPDATE lead_ingestion_errors
     SET raw_payload = '{"redacted":true}'::jsonb
     WHERE raw_payload::text ILIKE $1`,
    [`%${id}%`],
  )
  const n = await purgeLead(id)
  return { ok: true, purged: n > 0 }
})
