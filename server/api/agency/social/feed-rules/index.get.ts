import { requirePermission } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/** GET /api/agency/social/feed-rules — list auto-draft rules. */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId.trim() : undefined
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const rules = await queryRows(
    `SELECT r.id, r.client_id, r.event_types, r.enabled, r.caption_template, r.notify_user_id, r.created_at,
            c.name AS client_name,
            (SELECT COUNT(*) FROM feed_rule_executions e WHERE e.rule_id = r.id) AS drafts_created
       FROM feed_post_rules r
       LEFT JOIN agency_clients c ON c.id = r.client_id
      WHERE r.client_id = $1
      ORDER BY r.created_at DESC`,
    [clientId]
  )
  return { rules }
})
