import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const departments = await queryRows(
    `SELECT id, name, slug FROM departments ORDER BY name`,
  )
  const goals = await queryRows(
    `SELECT goal.id, goal.department_id, department.name AS department_name,
            goal.name, goal.status, version.id AS version_id, version.version,
            version.objective, version.metric_name, version.unit, version.direction,
            version.target_value, version.target_min, version.target_max,
            version.target_description, version.period_start, version.period_end,
            version.source_type, version.source_ref, version.accountable_owner_id,
            owner.name AS accountable_owner_name, version.status AS version_status,
            version.published_at,
            (SELECT COUNT(*) FROM hr_role_kpi_goal_links link
              WHERE link.department_goal_version_id = version.id) AS linked_kpis
     FROM hr_department_goals goal
     JOIN departments department ON department.id = goal.department_id
     JOIN LATERAL (
       SELECT * FROM hr_department_goal_versions candidate
       WHERE candidate.goal_id = goal.id
       ORDER BY candidate.version DESC LIMIT 1
     ) version ON true
     LEFT JOIN team_members owner ON owner.id = version.accountable_owner_id
     WHERE goal.status <> 'archived'
     ORDER BY version.period_end DESC, department.name, goal.name`,
  )
  const owners = await queryRows(
    `SELECT id, name, email FROM team_members WHERE is_active = true ORDER BY name`,
  )
  return { departments, goals, owners }
})
