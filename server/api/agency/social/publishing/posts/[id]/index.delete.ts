import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOneFresh } from '~~/server/utils/db'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'

/**
 * DELETE /api/agency/social/publishing/posts/:id
 */
export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const post = await requireSocialPostClientAccess(event, id)
  const deleted = await queryOneFresh(`DELETE FROM social_posts p WHERE p.id=$1 AND p.client_id=$2
    AND p.status NOT IN ('published','partially_published','publishing')
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p.platform_results,'{}'::jsonb)) r WHERE r.value->>'status'='success')
    AND NOT EXISTS (SELECT 1 FROM social_live_operations o WHERE o.post_id=p.id)
    RETURNING id`, [id, post.client_id])
  if (!deleted) throw createError({ statusCode: 409, statusMessage: 'Published records must stay in the archive. Use Manage Facebook for supported live removals.' })
  return { ok: true }
})
