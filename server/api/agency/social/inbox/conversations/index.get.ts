import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/inbox/conversations?clientId=&channel=&platform=&status=&limit=
 * List a client's engagement conversations, newest activity first.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const params: any[] = [clientId]
  let sql = `
    SELECT
      c.*,
      COALESCE(c.participant_name, latest_in.author_name) AS participant_name
    FROM social_conversations c
    LEFT JOIN LATERAL (
      SELECT author_name
      FROM social_messages m
      WHERE m.conversation_id = c.id
        AND m.direction = 'in'
        AND m.author_name IS NOT NULL
      ORDER BY m.platform_timestamp DESC NULLS LAST, m.created_at DESC
      LIMIT 1
    ) latest_in ON TRUE
    WHERE c.client_id = $1`
  for (const [col, key] of [['channel_type', 'channel'], ['platform', 'platform'], ['status', 'status'], ['assigned_to', 'assignedTo']] as const) {
    if (q[key]) { params.push(q[key]); sql += ` AND c.${col} = $${params.length}` }
  }
  if (q.unassigned === 'true') sql += ` AND c.assigned_to IS NULL`
  if (q.breached === 'true') sql += ` AND c.sla_breached = TRUE`
  params.push(Math.min(Number(q.limit) || 100, 500))
  sql += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${params.length}`

  return await queryRows(sql, params)
})
