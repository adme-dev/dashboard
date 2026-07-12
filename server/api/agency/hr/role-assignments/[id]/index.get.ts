import { createError, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { canManageHr } from '~~/server/utils/hr/access'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role assignment',
    })
  const assignment = await queryOne<any>(
    `SELECT assignment.id, assignment.team_member_id, assignment.effective_from,
            assignment.acknowledgement_status, assignment.acknowledgement_note,
            assignment.acknowledged_at,
            member.name AS member_name, profile.title AS role_title,
            role_version.version AS role_version, role_version.purpose,
            role_version.responsibilities, role_version.expected_outcomes,
            scorecard.id AS scorecard_version_id, scorecard.version AS scorecard_version,
            scorecard.criteria, scorecard.evidence_threshold
       FROM hr_role_assignments assignment
       JOIN team_members member ON member.id = assignment.team_member_id
       JOIN hr_role_profile_versions role_version ON role_version.id = assignment.role_profile_version_id
       JOIN hr_role_profiles profile ON profile.id = role_version.role_profile_id
       JOIN hr_role_scorecard_versions scorecard ON scorecard.id = assignment.scorecard_version_id
      WHERE assignment.id = $1 AND assignment.effective_to IS NULL`,
    [id],
  )
  if (!assignment)
    throw createError({
      statusCode: 404,
      statusMessage: 'Active role assignment not found',
    })
  if (assignment.team_member_id !== user.id && !canManageHr(user))
    throw createError({
      statusCode: 403,
      statusMessage: 'You cannot view this role assignment',
    })
  return { assignment }
})
