import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/response-queue/:id/reject */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const row = await queryOne<any>(`SELECT conversation_id, status FROM social_response_queue WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `cannot reject a ${row.status} item` })
  await execute(
    `UPDATE social_response_queue SET status = 'rejected', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id, String(user.id)])
  await execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  return { ok: true }
})
