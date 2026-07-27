/**
 * Client Portal - Project Detail
 * GET /api/portal/projects/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

interface TeamMemberRow {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  role: string | null
  department: string | null
}

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewProjects) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to view projects'
    })
  }

  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  try {
    const project = await queryOne(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.status,
        p.start_date,
        p.due_date,
        p.budget,
        p.created_at,
        pm.name as project_manager_name,
        pm.avatar_url as project_manager_avatar
      FROM projects p
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      WHERE p.id = $1 AND p.client_id = $2
    `, [projectId, clientUser.clientId])

    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    // Task summary
    const taskStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN t.status_is_final THEN 1 END) as completed,
        COUNT(CASE WHEN NOT t.status_is_final AND ts.name != 'Backlog' THEN 1 END) as in_progress
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.project_id = $1
    `, [projectId])

    // Upcoming tasks/milestones
    const upcomingTasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.due_date,
        t.start_date,
        t.priority,
        t.task_type,
        ts.name as status_name,
        ts.color as status_color,
        assignee.name as assignee_name,
        assignee.avatar_url as assignee_avatar
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.project_id = $1
        AND t.status_is_final = false
      ORDER BY t.due_date ASC NULLS LAST
      LIMIT 10
    `, [projectId])

    // Completed task history
    const completedTaskHistory = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.due_date,
        t.completed_at,
        t.priority,
        t.task_type,
        ts.name as status_name,
        ts.color as status_color,
        assignee.name as assignee_name,
        assignee.avatar_url as assignee_avatar
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.project_id = $1
        AND t.status_is_final = true
      ORDER BY t.completed_at DESC NULLS LAST, t.due_date DESC NULLS LAST, t.updated_at DESC
      LIMIT 20
    `, [projectId])

    // Deliverables
    const deliverables = await queryRows(`
      SELECT
        cd.id, cd.title, cd.deliverable_type, cd.thumbnail_url, cd.status,
        cd.is_featured, cd.published_at, cd.created_at
      FROM client_deliverables cd
      WHERE cd.project_id = $1 AND cd.client_id = $2 AND cd.is_visible_to_client = true
      ORDER BY cd.is_featured DESC, cd.created_at DESC
      LIMIT 20
    `, [projectId, clientUser.clientId])

    // Pending approvals
    const approvals = await queryRows(`
      SELECT
        ca.id, ca.approval_type, ca.title, ca.status, ca.due_date, ca.requested_at,
        tm.name as requested_by_name
      FROM client_approvals ca
      LEFT JOIN team_members tm ON ca.requested_by = tm.id
      WHERE ca.project_id = $1
      ORDER BY
        CASE ca.status WHEN 'pending' THEN 0 ELSE 1 END,
        ca.due_date ASC NULLS LAST
      LIMIT 20
    `, [projectId])

    // Project settings (visibility controls)
    const settings = await queryOne(`
      SELECT show_budget, show_time_tracking, show_task_details, show_team_members,
             show_milestones, show_comments, show_files
      FROM client_project_settings
      WHERE project_id = $1
    `, [projectId])

    // Team members assigned to tasks on this project (when settings allow)
    let teamMembers: TeamMemberRow[] = []
    if (settings?.show_team_members !== false) {
      teamMembers = await queryRows(`
        SELECT DISTINCT ON (tm.id)
          tm.id, tm.name, tm.email, tm.avatar_url, tm.role, d.name AS department
        FROM team_members tm
        JOIN tasks t ON t.assignee_id = tm.id
        LEFT JOIN departments d ON d.id = tm.department_id
        WHERE t.project_id = $1
        ORDER BY tm.id
        LIMIT 10
      `, [projectId])
    }

    const totalTasks = Number(taskStats?.total || 0)
    const completedTasks = Number(taskStats?.completed || 0)
    const canViewBudget = clientUser.permissions.canViewBudgets
      && settings?.show_budget !== false
    const canViewTaskDetails = settings?.show_task_details !== false

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: project.start_date,
        dueDate: project.due_date,
        budget: canViewBudget ? Number(project.budget || 0) : null,
        createdAt: project.created_at,
        projectManager: {
          name: project.project_manager_name,
          avatarUrl: project.project_manager_avatar
        },
        tasks: canViewTaskDetails
          ? {
              total: totalTasks,
              completed: completedTasks,
              inProgress: Number(taskStats?.in_progress || 0),
              progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
            }
          : null
      },
      upcomingTasks: canViewTaskDetails ? upcomingTasks.map(t => ({
        id: t.id,
        title: t.title,
        startDate: t.start_date,
        dueDate: t.due_date,
        priority: t.priority,
        taskType: t.task_type,
        status: { name: t.status_name, color: t.status_color },
        assignee: t.assignee_name
          ? {
              name: t.assignee_name,
              avatarUrl: t.assignee_avatar
            }
          : null
      })) : [],
      completedTasks: canViewTaskDetails ? completedTaskHistory.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        completedAt: t.completed_at,
        priority: t.priority,
        taskType: t.task_type,
        status: { name: t.status_name, color: t.status_color },
        assignee: t.assignee_name
          ? {
              name: t.assignee_name,
              avatarUrl: t.assignee_avatar
            }
          : null
      })) : [],
      deliverables: settings?.show_files !== false ? deliverables.map(d => ({
        id: d.id,
        title: d.title,
        type: d.deliverable_type,
        thumbnailUrl: d.thumbnail_url,
        status: d.status,
        isFeatured: d.is_featured,
        publishedAt: d.published_at
      })) : [],
      approvals: approvals.map(a => ({
        id: a.id,
        approvalType: a.approval_type,
        title: a.title,
        status: a.status,
        dueDate: a.due_date,
        requestedAt: a.requested_at,
        requestedByName: a.requested_by_name
      })),
      teamMembers: teamMembers.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatar_url,
        role: m.role,
        department: m.department
      })),
      settings: settings || {
        show_budget: false,
        show_time_tracking: false,
        show_task_details: true,
        show_team_members: true,
        show_milestones: true,
        show_comments: true,
        show_files: true
      }
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch project' })
  }
})
