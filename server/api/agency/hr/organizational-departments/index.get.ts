import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { suggestHrRosterClassification } from '~~/server/utils/hr/rosterClassification'

export default defineEventHandler(async (event) => {
  await requireHrAdmin(event)

  const [departments, members] = await Promise.all([
    queryRows(
      `SELECT department.id, department.name, department.description, department.color,
              COUNT(member.id)::int AS member_count
         FROM departments department
         LEFT JOIN team_members member
           ON member.department_id = department.id AND member.is_active = TRUE
        WHERE department.department_kind = 'organizational'
          AND department.is_active = TRUE
        GROUP BY department.id
        ORDER BY department.sort_order, department.name`,
    ),
    queryRows<any>(
      `SELECT member.id, member.name, member.email,
              COALESCE(member.role, member.user_role::text) AS current_role,
              member.department_id,
              department.name AS department_name,
              classification.classification,
              classification.person_type,
              classification.review_eligible,
              classification.reason AS classification_reason,
              classification.confirmed_at
         FROM team_members member
         LEFT JOIN departments department
           ON department.id = member.department_id
          AND department.department_kind = 'organizational'
        LEFT JOIN hr_roster_classifications classification
          ON classification.team_member_id = member.id
        WHERE member.is_active = TRUE
        ORDER BY member.name`,
    ),
  ])

  return {
    departments,
    members: members.map(member => ({
      ...member,
      suggestion: suggestHrRosterClassification({ name: member.name, email: member.email, role: member.current_role }),
    })),
  }
})
