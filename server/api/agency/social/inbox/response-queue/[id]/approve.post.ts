import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'

/**
 * POST /api/agency/social/inbox/response-queue/:id/approve  body { content? }
 * Human approves a pending automation draft → send it. A human approval is an explicit
 * action (like manual reply) so it is NOT behind the autopilot master gate. Optional edited content.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  const row = await queryOne<any>(
    `SELECT * FROM social_response_queue WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending' && row.status !== 'approved')
    throw createError({ statusCode: 409, statusMessage: `cannot approve a ${row.status} item` })

  const content = String(body?.content ?? row.draft_content).trim()
  if (!content) throw createError({ statusCode: 400, statusMessage: 'empty content' })

  const res = await dispatchReply({ queryOne, execute }, row.conversation_id, {
    content, sentByUserId: String(user.id), aiGenerated: true,
  })
  await execute(
    `UPDATE social_response_queue SET status = $2, approved_by = $3, approved_at = NOW(),
       draft_content = $4, error = $5, updated_at = NOW() WHERE id = $1`,
    [id, res.ok ? 'sent' : 'failed', String(user.id), content, res.ok ? null : (res.error ?? 'send failed')])
  await execute(
    `UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'send failed' })
  return { ok: true, platformMessageId: res.platformMessageId }
})
