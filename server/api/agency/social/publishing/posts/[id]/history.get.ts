import { queryRows } from '~~/server/utils/db'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'

/** Client-scoped, paginated archive of recorded publishing actions. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Post required' })
  const post = await requireSocialPostClientAccess(event, id)
  const offset = Number(getQuery(event).offset || 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid history offset' })
  }
  const rows = await queryRows(
    `SELECT e.id, e.action, e.created_at, e.actor_id, t.name AS actor_name,
       a.account_name, a.platform,
       jsonb_strip_nulls(jsonb_build_object(
         'source', e.metadata->'source', 'status', e.metadata->'status',
         'fields', e.metadata->'fields', 'approvalReset', e.metadata->'approvalReset'
       )) AS details
     FROM social_publishing_audit_events e
     LEFT JOIN team_members t ON t.id::text = e.actor_id
     LEFT JOIN social_accounts a ON a.id = e.social_account_id AND a.client_id = e.client_id
     WHERE e.post_id = $1 AND e.client_id = $2
     ORDER BY e.created_at DESC, e.id DESC LIMIT 51 OFFSET $3`,
    [id, post.client_id, offset]
  )
  return { events: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }
})
