import { createError, readBody, setHeader } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrDepartmentGoalSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrDepartmentGoalSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid department goal', data: { issues: parsed.error.issues } })
  const input = parsed.data
  const result = await transaction(async (db) => {
    const department = await db.query('SELECT id FROM departments WHERE id = $1', [input.departmentId])
    if (!department.rows[0]) throw new Error('Department not found')
    if (input.accountableOwnerId) {
      const owner = await db.query('SELECT id FROM team_members WHERE id = $1 AND is_active = true', [input.accountableOwnerId])
      if (!owner.rows[0]) throw new Error('Accountable owner must be an active team member')
    }
    const status = input.publish ? 'published' : 'draft'
    const goal = await db.query(
      `INSERT INTO hr_department_goals (department_id, name, status, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, department_id, name, status`,
      [input.departmentId, input.name, input.publish ? 'active' : 'draft', user.id],
    )
    const version = await db.query(
      `INSERT INTO hr_department_goal_versions
        (goal_id, version, objective, metric_name, unit, direction, target_value,
         target_min, target_max, target_description, period_start, period_end,
         source_type, source_ref, accountable_owner_id, status, published_by, published_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16, CASE WHEN $15 = 'published' THEN NOW() ELSE NULL END)
       RETURNING id, version, status, published_at`,
      [
        goal.rows[0].id, input.objective, input.metricName, input.unit, input.direction,
        input.targetValue ?? null, input.targetMin ?? null, input.targetMax ?? null,
        input.targetDescription || null, input.periodStart, input.periodEnd,
        input.sourceType, input.sourceRef, input.accountableOwnerId || null,
        status, input.publish ? user.id : null,
      ],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: input.publish ? 'department_goal.published' : 'department_goal.created',
      targetType: 'department_goal',
      targetId: goal.rows[0].id,
      metadata: { departmentId: input.departmentId, periodEnd: input.periodEnd },
    }, db)
    return { goal: goal.rows[0], version: version.rows[0] }
  })
  return { ok: true, ...result }
})
