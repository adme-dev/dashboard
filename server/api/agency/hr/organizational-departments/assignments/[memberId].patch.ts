import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { hrOrganizationalDepartmentAssignmentSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  const user = await requireHrAdmin(event)
  const memberIdResult = z.string().uuid().safeParse(getRouterParam(event, 'memberId'))
  if (!memberIdResult.success) throw createError({ statusCode: 400, statusMessage: 'A valid team member ID is required' })
  const memberId = memberIdResult.data

  const parsed = hrOrganizationalDepartmentAssignmentSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid organizational department assignment', data: { issues: parsed.error.issues } })
  }

  const assignment = await transaction(async (db) => {
    const memberResult = await db.query(
      `SELECT id, name, department_id
         FROM team_members
        WHERE id = $1 AND is_active = TRUE
        FOR UPDATE`,
      [memberId],
    )
    const member = memberResult.rows[0]
    if (!member) throw createError({ statusCode: 404, statusMessage: 'Active team member not found' })

    const departmentResult = await db.query(
      `SELECT id, name
         FROM departments
        WHERE id = $1 AND is_active = TRUE AND department_kind = 'organizational'`,
      [parsed.data.departmentId],
    )
    const department = departmentResult.rows[0]
    if (!department) throw createError({ statusCode: 409, statusMessage: 'Only an active organizational department can be assigned for HR' })

    if (member.department_id !== department.id) {
      await db.query('UPDATE team_members SET department_id = $2, updated_at = NOW() WHERE id = $1', [memberId, department.id])
      await recordHrAuditEvent({
        actorId: user.id,
        action: 'organizational_department.assigned',
        targetType: 'team_member',
        targetId: memberId,
        metadata: {
          previousDepartmentId: member.department_id || null,
          departmentId: department.id,
        },
      }, db)
    }

    return {
      teamMemberId: member.id,
      teamMemberName: member.name,
      departmentId: department.id,
      departmentName: department.name,
      changed: member.department_id !== department.id,
    }
  })

  return { assignment }
})
