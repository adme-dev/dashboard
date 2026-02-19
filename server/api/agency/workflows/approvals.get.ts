/**
 * Get available approval workflows
 * GET /api/agency/workflows/approvals
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const departmentId = query.departmentId as string | undefined

  try {
    // Build query conditions
    const conditions: string[] = ['aw.is_active = true']
    const params: any[] = []
    let idx = 1

    if (departmentId) {
      conditions.push(`(aw.department_id = $${idx} OR aw.department_id IS NULL)`)
      params.push(departmentId)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const workflows = await queryRows(`
      SELECT
        aw.id,
        aw.name,
        aw.description,
        aw.department_id,
        aw.is_default,
        d.name AS department_name,
        (SELECT COUNT(*) FROM approval_workflow_steps WHERE workflow_id = aw.id) AS step_count,
        aw.created_at
      FROM approval_workflows aw
      LEFT JOIN departments d ON aw.department_id = d.id
      ${whereClause}
      ORDER BY aw.is_default DESC, aw.name
    `, params)

    return {
      workflows: workflows.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        departmentId: w.department_id,
        departmentName: w.department_name,
        isDefault: w.is_default,
        stepCount: Number(w.step_count),
        createdAt: w.created_at
      }))
    }
  } catch (error) {
    console.error('Failed to fetch approval workflows:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch approval workflows'
    })
  }
})
