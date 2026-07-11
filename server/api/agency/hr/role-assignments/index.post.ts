import { createError, readBody } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrRoleAssignmentSchema } from '~~/server/utils/hr/schemas'

export default defineEventHandler(async (event) => {
  const user = await requireHrAdmin(event)
  const parsed = hrRoleAssignmentSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role assignment', data: { issues: parsed.error.issues } })
  }

  const assignment = await transaction(async (db) => {
    const eligible = await db.query(
      `SELECT member.id AS team_member_id, member.name AS member_name,
              version.id AS role_profile_version_id, profile.title AS role_title
         FROM team_members member
         JOIN hr_roster_classifications classification ON classification.team_member_id = member.id
         JOIN hr_role_profile_versions version ON version.id = $2
         JOIN hr_role_profiles profile ON profile.id = version.role_profile_id
        WHERE member.id = $1 AND member.is_active = TRUE
          AND classification.review_eligible = TRUE
          AND version.status = 'published' AND profile.status = 'active'
        FOR UPDATE OF member`,
      [parsed.data.teamMemberId, parsed.data.roleProfileVersionId],
    )
    if (!eligible.rows[0]) {
      throw createError({ statusCode: 409, statusMessage: 'The team member must be confirmed as review eligible and the published role must be active' })
    }

    const current = await db.query(
      `SELECT id, role_profile_version_id
         FROM hr_role_assignments
        WHERE team_member_id = $1 AND effective_to IS NULL
        FOR UPDATE`,
      [parsed.data.teamMemberId],
    )
    if (current.rows[0]?.role_profile_version_id === parsed.data.roleProfileVersionId) {
      return { ...eligible.rows[0], id: current.rows[0].id, created: false }
    }

    if (current.rows[0]) {
      await db.query(
        `UPDATE hr_role_assignments
            SET effective_to = GREATEST(effective_from, CURRENT_DATE)
          WHERE id = $1 AND effective_to IS NULL`,
        [current.rows[0].id],
      )
    }

    const inserted = await db.query(
      `INSERT INTO hr_role_assignments (team_member_id, role_profile_version_id)
       VALUES ($1, $2)
       RETURNING id`,
      [parsed.data.teamMemberId, parsed.data.roleProfileVersionId],
    )
    await recordHrAuditEvent({
      actorId: user.id,
      action: 'role_assignment.created',
      targetType: 'hr_role_assignment',
      targetId: inserted.rows[0].id,
      metadata: {
        teamMemberId: parsed.data.teamMemberId,
        roleProfileVersionId: parsed.data.roleProfileVersionId,
        replacedAssignment: Boolean(current.rows[0]),
      },
    }, db)

    return { ...eligible.rows[0], id: inserted.rows[0].id, created: true }
  })

  return { assignment }
})
