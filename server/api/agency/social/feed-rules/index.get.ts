import { requirePermission } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/feed-rules — list auto-draft rules. */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const rules = await queryRows(
    `SELECT r.id, r.client_id, r.event_types, r.enabled, r.caption_template, r.notify_user_id, r.created_at,
            c.name AS client_name,
            (SELECT COUNT(*) FROM feed_rule_executions e WHERE e.rule_id = r.id) AS drafts_created
       FROM feed_post_rules r
       LEFT JOIN agency_clients c ON c.id = r.client_id
      ORDER BY r.created_at DESC`,
  )
  return { rules }
})
