import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrDepartmentGoalRevisionSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const goalId = getRouterParam(event, 'id')
  if (!goalId || !/^[0-9a-f-]{36}$/i.test(goalId)) throw createError({ statusCode: 400, statusMessage: 'Invalid department goal' })
  const parsed = hrDepartmentGoalRevisionSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid department goal revision', data: { issues: parsed.error.issues } })
  const input = parsed.data

  const result = await transaction(async (db) => {
    const goalResult = await db.query(
      `SELECT id, status FROM hr_department_goals WHERE id = $1 FOR UPDATE`,
      [goalId],
    )
    if (!goalResult.rows[0] || goalResult.rows[0].status === 'archived') {
      throw createError({ statusCode: 404, statusMessage: 'Department goal not found' })
    }
    const currentResult = await db.query(
      `SELECT id, version, status FROM hr_department_goal_versions
       WHERE goal_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [goalId],
    )
    const current = currentResult.rows[0]
    if (!current) throw createError({ statusCode: 404, statusMessage: 'Department goal version not found' })
    if (Number(current.version) !== input.expectedVersion) {
      throw createError({ statusCode: 409, statusMessage: `Department goal changed since it was opened; refresh from version ${current.version}` })
    }
    const department = await db.query('SELECT id FROM departments WHERE id = $1', [input.departmentId])
    if (!department.rows[0]) throw createError({ statusCode: 400, statusMessage: 'Department not found' })
    if (input.accountableOwnerId) {
      const owner = await db.query('SELECT id FROM team_members WHERE id = $1 AND is_active = true', [input.accountableOwnerId])
      if (!owner.rows[0]) throw createError({ statusCode: 400, statusMessage: 'Accountable owner must be an active team member' })
    }

    if (input.publish) {
      await db.query(
        `UPDATE hr_department_goal_versions SET status = 'superseded'
         WHERE goal_id = $1 AND status = 'published'`,
        [goalId],
      )
    }
    await db.query(
      `UPDATE hr_department_goals
       SET department_id = $2, name = $3,
           status = CASE WHEN $4::boolean THEN 'active' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [goalId, input.departmentId, input.name, input.publish],
    )
    const status = input.publish ? 'published' : 'draft'
    const versionResult = await db.query(
      `INSERT INTO hr_department_goal_versions
        (goal_id, version, objective, metric_name, unit, direction, target_value,
         target_min, target_max, target_description, period_start, period_end,
         source_type, source_ref, accountable_owner_id, status, published_by, published_at)
       SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16,
              CASE WHEN $15 = 'published' THEN NOW() ELSE NULL END
       FROM hr_department_goal_versions WHERE goal_id = $1
       RETURNING id, goal_id, version, status, published_at`,
      [goalId, input.objective, input.metricName, input.unit, input.direction,
        input.targetValue ?? null, input.targetMin ?? null, input.targetMax ?? null,
        input.targetDescription || null, input.periodStart, input.periodEnd,
        input.sourceType, input.sourceRef, input.accountableOwnerId || null,
        status, input.publish ? user.id : null],
    )
    const version = versionResult.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'department_goal.revised',
      targetType: 'department_goal',
      targetId: goalId,
      metadata: { fromVersion: input.expectedVersion, toVersion: version.version, published: input.publish },
    }, db)
    return { goal: { id: goalId, name: input.name, status: input.publish ? 'active' : goalResult.rows[0].status }, version }
  })

  return { ok: true, ...result }
})
