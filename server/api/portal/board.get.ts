import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, queryRows } from '~~/server/utils/db'

const MAX_ITEMS = 250

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewProjects) {
    throw createError({ statusCode: 403, statusMessage: 'Project access is required' })
  }

  const board = await queryOne<{ id: string, name: string, description: string | null, color: string | null }>(
    `SELECT d.id, d.name, d.description, d.color
       FROM agency_clients c
       JOIN departments d ON d.id = c.portal_board_id AND d.is_active = TRUE
      WHERE c.id = $1 AND c.is_active = TRUE`,
    [clientUser.clientId]
  )

  if (!board) return { linked: false, board: null, groups: [], total: 0, limit: MAX_ITEMS, more: 0 }

  const rows = await queryRows<{
    id: string, title: string, description: string | null, priority: string | null,
    due_date: string | null, progress_percentage: number | null, updated_at: string,
    group_id: string | null, group_name: string | null, group_color: string | null,
    group_sort_order: number | null, status_name: string | null, status_color: string | null,
    project_name: string, assignee_name: string | null
  }>(
    `SELECT t.id, t.title, t.description, t.priority, t.due_date, t.progress_percentage,
            t.updated_at::text, bg.id AS group_id, bg.name AS group_name,
            bg.color AS group_color, bg.sort_order AS group_sort_order,
            ts.name AS status_name, ts.color AS status_color,
            p.name AS project_name, tm.name AS assignee_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id AND p.client_id = $2
       LEFT JOIN board_groups bg ON bg.id = t.group_id AND bg.department_id = t.department_id
       LEFT JOIN task_statuses ts ON ts.id = t.status_id
       LEFT JOIN team_members tm ON tm.id = t.assignee_id
      WHERE t.department_id = $1
        AND t.parent_task_id IS NULL
      ORDER BY COALESCE(bg.sort_order, 2147483647), t.sort_order, t.updated_at DESC
      LIMIT $3`,
    [board.id, clientUser.clientId, MAX_ITEMS + 1]
  )

  const truncated = rows.length > MAX_ITEMS
  const visible = truncated ? rows.slice(0, MAX_ITEMS) : rows
  const grouped = new Map<string, { id: string | null, name: string, color: string | null, items: unknown[] }>()
  for (const row of visible) {
    const key = row.group_id ?? '__ungrouped__'
    if (!grouped.has(key)) grouped.set(key, {
      id: row.group_id,
      name: row.group_name ?? 'Other work',
      color: row.group_color,
      items: [],
    })
    grouped.get(key)!.items.push({
      id: row.id,
      title: row.title,
      description: row.description,
      projectName: row.project_name,
      status: row.status_name ?? 'Unassigned',
      statusColor: row.status_color,
      priority: row.priority,
      assigneeName: row.assignee_name,
      dueDate: row.due_date,
      progressPercent: Number(row.progress_percentage || 0),
      updatedAt: row.updated_at,
    })
  }

  return {
    linked: true,
    board,
    groups: [...grouped.values()],
    total: visible.length,
    limit: MAX_ITEMS,
    more: truncated ? 1 : 0,
    readOnly: true,
    scope: 'linked_board_client_projects',
  }
})

