import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/response-queue?clientId=&status=pending */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const params: unknown[] = [clientId]
  let sql = `
    SELECT rq.*, r.name AS rule_name, c.platform, c.channel_type, c.participant_name, c.permalink,
           c.last_message_preview AS inbound_preview
      FROM social_response_queue rq
      JOIN social_conversations c ON c.id = rq.conversation_id
      LEFT JOIN social_automation_rules r ON r.id = rq.rule_id
     WHERE rq.client_id = $1`
  if (q.status === 'actionable') {
    sql += ` AND (
      (rq.approver_type = 'staff' AND rq.status = 'pending') OR
      (rq.approver_type = 'client' AND rq.status = 'approved')
    )`
  } else if (q.status) {
    params.push(q.status)
    sql += ` AND rq.status = $${params.length}`
  }
  params.push(Math.min(Number(q.limit) || 100, 500))
  sql += ` ORDER BY rq.created_at DESC LIMIT $${params.length}`
  return await queryRows(sql, params)
})
