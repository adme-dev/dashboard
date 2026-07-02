import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const FIELDS: Record<string, string> = {
  name: 'name', color: 'color', status: 'status', startDate: 'start_date',
  endDate: 'end_date', brief: 'brief', goalPostCount: 'goal_post_count',
}

/** PATCH /api/agency/social/publishing/campaigns/:id */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)
  const existing = await queryOne<{ id: string; client_id: string }>(
    'SELECT id, client_id FROM social_campaigns WHERE id = $1',
    [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  await requireSocialClientAccess(event, existing.client_id)
  const sets: string[] = []; const params: any[] = []
  for (const [key, col] of Object.entries(FIELDS)) {
    if (!(key in b)) continue
    params.push(b[key]); sets.push(`${col} = $${params.length}`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })
  sets.push('updated_at = NOW()'); params.push(id); params.push(existing.client_id)
  const row = await queryOne(
    `UPDATE social_campaigns SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND client_id = $${params.length} RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return row
})
