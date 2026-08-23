import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  return await queryRows(`
    SELECT v.id, v.brand_kit_id AS "brandKitId", v.version, v.note, v.snapshot,
           v.created_by AS "createdBy", v.created_at AS "createdAt",
           tm.name AS "createdByName"
    FROM brand_kit_versions v
    LEFT JOIN team_members tm ON tm.id = v.created_by
    WHERE v.brand_kit_id = $1
    ORDER BY v.version DESC
    LIMIT 50
  `, [id])
})
