import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

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
    queryRows(
      `SELECT member.id, member.name, member.email,
              member.department_id,
              department.name AS department_name
         FROM team_members member
         LEFT JOIN departments department
           ON department.id = member.department_id
          AND department.department_kind = 'organizational'
        WHERE member.is_active = TRUE
        ORDER BY member.name`,
    ),
  ])

  return { departments, members }
})
