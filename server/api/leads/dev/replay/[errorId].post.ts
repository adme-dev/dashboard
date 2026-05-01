// server/api/leads/dev/replay/[errorId].post.ts
// Dev-environment only. Refeeds a stored ingestion error through the pipeline.

import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 403, statusMessage: 'disabled_in_prod' })
  }
  await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'errorId')!
  const row = await queryOne<{ source: string; raw_payload: any }>(
    `SELECT source, raw_payload FROM lead_ingestion_errors WHERE id = $1`, [id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (row.source !== 'google') {
    throw createError({ statusCode: 400, statusMessage: 'meta_replay_in_phase_2' })
  }
  return { ok: true, replay_payload: row.raw_payload }
})
