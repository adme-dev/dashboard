import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { decideRoleAcknowledgement } from '~~/server/utils/hr/roleAcknowledgement'

const Body = z
  .object({
    status: z.enum(['acknowledged', 'disputed']),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((input, context) => {
    if (input.status === 'disputed' && !input.note)
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Explain what is inaccurate or incomplete.',
      })
  })

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role assignment',
    })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid acknowledgement',
      data: { issues: parsed.error.issues },
    })
  const acknowledgement = await transaction(async (db) => {
    const result = await db.query(
      'SELECT id, team_member_id, role_profile_version_id, scorecard_version_id, acknowledgement_status, acknowledgement_note, acknowledged_at FROM hr_role_assignments WHERE id = $1 AND effective_to IS NULL FOR UPDATE',
      [id],
    )
    const assignment = result.rows[0]
    if (!assignment)
      throw createError({
        statusCode: 404,
        statusMessage: 'Active role assignment not found',
      })
    if (assignment.team_member_id !== user.id)
      throw createError({
        statusCode: 403,
        statusMessage:
          'Only the assigned person can acknowledge this role and scorecard baseline',
      })
    const decision = decideRoleAcknowledgement(
      assignment.acknowledgement_status,
      parsed.data.status,
    )
    if (decision === 'unchanged') return assignment
    if (decision === 'reject')
      throw createError({
        statusCode: 409,
        statusMessage:
          'This baseline response is locked. Ask HR to issue a corrected role and scorecard version.',
      })
    const updated = await db.query(
      `UPDATE hr_role_assignments SET acknowledgement_status = $2, acknowledgement_note = $3,
              acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN COALESCE(acknowledged_at, NOW()) ELSE acknowledged_at END
        WHERE id = $1 AND acknowledgement_status = 'pending'
        RETURNING id, acknowledgement_status, acknowledgement_note, acknowledged_at`,
      [id, parsed.data.status, parsed.data.note || null],
    )
    await recordHrAuditEvent(
      {
        actorId: user.id,
        action:
          parsed.data.status === 'acknowledged'
            ? 'role_scorecard_assignment.acknowledged'
            : 'role_scorecard_assignment.disputed',
        targetType: 'role_assignment',
        targetId: id,
        metadata: {
          roleProfileVersionId: assignment.role_profile_version_id,
          scorecardVersionId: assignment.scorecard_version_id,
        },
      },
      db,
    )
    return updated.rows[0]
  })
  return { acknowledgement }
})
