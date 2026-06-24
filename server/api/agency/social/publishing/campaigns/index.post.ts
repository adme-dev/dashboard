import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

/** POST /api/agency/social/publishing/campaigns */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  if (!b.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  return await queryOne(
    `INSERT INTO social_campaigns
       (client_id, name, color, status, start_date, end_date, brief, goal_post_count, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      b.clientId, b.name.trim(), b.color ?? '#6366f1', b.status ?? 'active',
      b.startDate ?? null, b.endDate ?? null, b.brief ?? null, b.goalPostCount ?? null, user.id,
    ],
  )
})
