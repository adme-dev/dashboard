/**
 * Get Sorting Presets
 * GET /api/agency/sorting/presets
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined

  const params: any[] = []
  let sql = `
    SELECT
      sp.id,
      sp.department_id,
      d.name as department_name,
      sp.name,
      sp.sort_rules,
      sp.is_default,
      sp.is_system,
      sp.created_by,
      tm.name as created_by_name,
      sp.created_at
    FROM sorting_presets sp
    LEFT JOIN departments d ON sp.department_id = d.id
    LEFT JOIN team_members tm ON sp.created_by = tm.id
  `

  if (departmentId) {
    params.push(departmentId)
    sql += ` WHERE sp.department_id = $${params.length} OR sp.department_id IS NULL`
  }

  sql += ` ORDER BY sp.is_system DESC, sp.is_default DESC, sp.name ASC`

  const presets = await queryRows(sql, params)

  return presets.map(preset => ({
    id: preset.id,
    departmentId: preset.department_id,
    departmentName: preset.department_name,
    name: preset.name,
    sortRules: preset.sort_rules || [],
    isDefault: preset.is_default,
    isSystem: preset.is_system,
    createdBy: preset.created_by,
    createdByName: preset.created_by_name,
    createdAt: preset.created_at
  }))
})
