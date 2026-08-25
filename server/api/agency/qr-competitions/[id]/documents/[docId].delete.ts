/** Soft delete with an audited reason — the file stays in storage; the row keeps its hash. */
import { z } from 'zod'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { isUuid } from '~~/server/utils/client-access'

export default defineEventHandler(async (event) => {
  const { user, row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const docId = getRouterParam(event, 'docId')
  if (!isUuid(docId)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const parsed = z.object({ reason: z.string().trim().min(3).max(400) }).safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A reason is required to remove a legal document' })
  await executeQrMutation(event, 'competition-document-delete', async (db) => {
    const r = await db.query(`UPDATE qr_competition_documents SET deleted_at = NOW(), deleted_by = $3, delete_reason = $4 WHERE id = $1 AND competition_id = $2 AND deleted_at IS NULL RETURNING id`, [docId, row.id, user.id, parsed.data.reason])
    if (!r.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    return { id: r.rows[0].id }
  }, async (_db, id) => ({ id }))
  return { ok: true }
})
