import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

const Body = z.object({
  status: z.enum(['acknowledged', 'disputed']),
  note: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.status === 'disputed' && !value.note) {
    context.addIssue({ code: 'custom', path: ['note'], message: 'Explain what is inaccurate or incomplete.' })
  }
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const assignmentId = getRouterParam(event, 'id')
  if (!assignmentId || !/^[0-9a-f-]{36}$/i.test(assignmentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid assignment' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid role acknowledgement', data: { issues: parsed.error.issues } })

  const result = await transaction(async (db) => {
    const assignmentResult = await db.query(
      `SELECT qa.id, participant.id AS participant_id, participant.team_member_id,
              participant.role_profile_version_id, participant.cycle_id,
              role_assignment.acknowledgement_status,
              role_assignment.id AS role_assignment_id
       FROM hr_questionnaire_assignments qa
       JOIN hr_review_participants participant ON participant.id = qa.participant_id
       LEFT JOIN hr_role_assignments role_assignment
         ON role_assignment.team_member_id = participant.team_member_id
        AND role_assignment.role_profile_version_id = participant.role_profile_version_id
        AND role_assignment.effective_to IS NULL
       WHERE qa.id = $1`,
      [assignmentId],
    )
    const assignment = assignmentResult.rows[0]
    if (!assignment) throw createError({ statusCode: 404, statusMessage: 'Assignment not found' })
    if (assignment.team_member_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'Only the participant can acknowledge this role baseline' })
    if (!assignment.role_assignment_id) throw createError({ statusCode: 409, statusMessage: 'Role assignment is not available for acknowledgement' })

    const updatedResult = await db.query(
      `UPDATE hr_role_assignments
       SET acknowledgement_status = $1,
           acknowledgement_note = $2,
           acknowledged_at = CASE WHEN $1 = 'acknowledged' THEN NOW() ELSE NULL END
       WHERE id = $3
       RETURNING id, acknowledgement_status, acknowledgement_note, acknowledged_at`,
      [parsed.data.status, parsed.data.note || null, assignment.role_assignment_id],
    )
    const updated = updatedResult.rows[0]
    await recordHrAuditEvent({
      actorId: user.id,
      action: parsed.data.status === 'acknowledged' ? 'role_assignment.acknowledged' : 'role_assignment.disputed',
      targetType: 'role_assignment',
      targetId: updated.id,
      cycleId: assignment.cycle_id,
      metadata: { participantId: assignment.participant_id, roleProfileVersionId: assignment.role_profile_version_id },
    }, db)
    return updated
  })
  return { ok: true, acknowledgement: result }
})
