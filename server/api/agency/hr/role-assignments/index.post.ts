import { createError, readBody } from 'h3'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrRoleAssignmentSchema } from '~~/server/utils/hr/schemas'
import { createNotification } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const user = await requireHrAdmin(event)
  const parsed = hrRoleAssignmentSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role assignment',
      data: { issues: parsed.error.issues },
    })
  }

  const assignment = await transaction(async (db) => {
    const eligible = await db.query(
      `SELECT member.id AS team_member_id, member.name AS member_name,
              version.id AS role_profile_version_id, profile.title AS role_title,
              scorecard.id AS scorecard_version_id
         FROM team_members member
         JOIN hr_roster_classifications classification ON classification.team_member_id = member.id
         JOIN hr_role_profile_versions version ON version.id = $2
         JOIN hr_role_profiles profile ON profile.id = version.role_profile_id
         JOIN LATERAL (
           SELECT candidate.id
             FROM hr_role_scorecard_versions candidate
            WHERE candidate.role_profile_version_id = version.id
              AND candidate.status = 'published'
            ORDER BY candidate.version DESC LIMIT 1
         ) scorecard ON TRUE
        WHERE member.id = $1 AND member.is_active = TRUE
          AND classification.review_eligible = TRUE
          AND version.status = 'published' AND profile.status = 'active'
        FOR UPDATE OF member`,
      [parsed.data.teamMemberId, parsed.data.roleProfileVersionId],
    )
    if (!eligible.rows[0]) {
      throw createError({
        statusCode: 409,
        statusMessage: 'The team member must be confirmed as review eligible and the published role must be active',
      })
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
      `INSERT INTO hr_role_assignments (team_member_id, role_profile_version_id, scorecard_version_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [parsed.data.teamMemberId, parsed.data.roleProfileVersionId, eligible.rows[0].scorecard_version_id],
    )
    await recordHrAuditEvent(
      {
        actorId: user.id,
        action: 'role_assignment.created',
        targetType: 'hr_role_assignment',
        targetId: inserted.rows[0].id,
        metadata: {
          teamMemberId: parsed.data.teamMemberId,
          roleProfileVersionId: parsed.data.roleProfileVersionId,
          replacedAssignment: Boolean(current.rows[0]),
        },
      },
      db,
    )

    return { ...eligible.rows[0], id: inserted.rows[0].id, created: true }
  })

  if (assignment.created) {
    await createNotification({
      userId: assignment.team_member_id,
      actorId: user.id,
      type: 'hr_role_assigned',
      title: 'Review your role baseline',
      message: `${assignment.role_title} and its published scorecard are ready for your acknowledgement.`,
      link: `/agency/hr/my-role/${assignment.id}`,
      reason: 'assigned',
      metadata: {
        roleProfileVersionId: assignment.role_profile_version_id,
        scorecardVersionId: assignment.scorecard_version_id,
      },
    })
  }

  return { assignment }
})
