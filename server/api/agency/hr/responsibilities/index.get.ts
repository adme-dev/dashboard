import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { buildResponsibilityMap, type ResponsibilitySource } from '~~/server/utils/hr/responsibilityMap'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const rows = await queryRows<ResponsibilitySource>(
    `SELECT version.id AS "roleVersionId",
            profile.title AS "roleTitle",
            responsibility.value AS responsibility,
            member.id AS "memberId",
            member.name AS "memberName"
       FROM hr_role_profile_versions version
       JOIN hr_role_profiles profile ON profile.id = version.role_profile_id
       CROSS JOIN LATERAL jsonb_array_elements_text(version.responsibilities) responsibility(value)
       LEFT JOIN hr_role_assignments assignment
         ON assignment.role_profile_version_id = version.id
        AND assignment.effective_from <= CURRENT_DATE
        AND (assignment.effective_to IS NULL OR assignment.effective_to >= CURRENT_DATE)
       LEFT JOIN team_members member ON member.id = assignment.team_member_id
      WHERE version.status = 'published'
        AND profile.status = 'active'
      ORDER BY responsibility.value, member.name`,
  )

  const map = buildResponsibilityMap(rows)
  await recordHrAuditEvent({
    actorId: user.id,
    action: 'responsibility_map.viewed',
    targetType: 'responsibility_map',
    metadata: { responsibilityCount: map.summary.total },
  })
  return map
})
