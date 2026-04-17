/**
 * Client Portal - Get Single Project
 * GET /api/agency/client-portal/projects/:id
 *
 * Returns detailed project view for client portal
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  try {
    // Get project details
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
        c.id as client_id,
        c.name as client_name,
        pm.id as project_manager_id,
        pm.name as project_manager_name,
        pm.email as project_manager_email,
        pm.avatar_url as project_manager_avatar,
        cps.show_budget,
        cps.show_time_tracking,
        cps.show_team_members,
        cps.show_task_details,
        cps.show_task_hours,
        cps.allow_comments
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      LEFT JOIN client_project_settings cps ON p.id = cps.project_id
      WHERE p.id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Get task statistics
    const taskStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN t.status_is_final THEN 1 END) as completed,
        COUNT(CASE WHEN NOT t.status_is_final THEN 1 END) as remaining
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.project_id = $1
    `, [projectId])

    // Get tasks grouped by status (for kanban view)
    const tasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.due_date,
        t.estimated_hours,
        ts.id as status_id,
        ts.name as status_name,
        ts.color as status_color,
        t.status_is_final,
        assignee.name as assignee_name,
        assignee.avatar_url as assignee_avatar
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.project_id = $1
      ORDER BY ts.display_order, t.due_date ASC NULLS LAST
    `, [projectId])

    // Get milestones
    const milestones = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.due_date,
        ts.name as status,
        t.status_is_final as is_completed
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.project_id = $1
        AND t.due_date IS NOT NULL
      ORDER BY t.due_date ASC
      LIMIT 10
    `, [projectId])

    // Get pending approvals
    const approvals = await queryRows(`
      SELECT
        ca.id,
        ca.approval_type,
        ca.title,
        ca.status,
        ca.due_date,
        ca.requested_at
      FROM client_approvals ca
      WHERE ca.project_id = $1
      ORDER BY
        CASE ca.status WHEN 'pending' THEN 0 ELSE 1 END,
        ca.requested_at DESC
      LIMIT 10
    `, [projectId])

    // Get deliverables
    const deliverables = await queryRows(`
      SELECT
        cd.id,
        cd.title,
        cd.deliverable_type,
        cd.thumbnail_url,
        cd.status,
        cd.is_featured,
        cd.published_at
      FROM client_deliverables cd
      WHERE cd.project_id = $1 AND cd.is_visible_to_client = true
      ORDER BY cd.is_featured DESC, cd.published_at DESC NULLS LAST
      LIMIT 12
    `, [projectId])

    // Get team members (if allowed)
    let teamMembers: any[] = []
    if (project.show_team_members !== false) {
      teamMembers = await queryRows(`
        SELECT DISTINCT
          tm.id,
          tm.name,
          tm.role,
          tm.avatar_url
        FROM team_members tm
        JOIN time_entries te ON tm.id = te.user_id
        WHERE te.project_id = $1
        LIMIT 10
      `, [projectId])
    }

    // Get time tracking (if allowed)
    let timeTracking = null
    if (project.show_time_tracking !== false) {
      timeTracking = await queryOne(`
        SELECT
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(CASE WHEN billable THEN hours ELSE 0 END), 0) as billable_hours
        FROM time_entries
        WHERE project_id = $1
      `, [projectId])
    }

    // Get recent comments
    const comments = await queryRows(`
      SELECT
        cc.id,
        cc.content,
        cc.created_at,
        cu.name as client_user_name,
        tm.name as team_member_name
      FROM client_comments cc
      LEFT JOIN client_users cu ON cc.client_user_id = cu.id
      LEFT JOIN team_members tm ON cc.team_member_id = tm.id
      WHERE cc.project_id = $1 AND cc.is_internal = false
      ORDER BY cc.created_at DESC
      LIMIT 10
    `, [projectId])

    // Calculate progress
    const totalTasks = Number(taskStats?.total || 0)
    const completedTasks = Number(taskStats?.completed || 0)
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: project.start_date,
        dueDate: project.due_date,
        budget: project.show_budget !== false ? Number(project.budget || 0) : null,
        createdAt: project.created_at,
        clientId: project.client_id,
        clientName: project.client_name,
        projectManager: project.project_manager_id ? {
          id: project.project_manager_id,
          name: project.project_manager_name,
          email: project.project_manager_email,
          avatarUrl: project.project_manager_avatar
        } : null,
        settings: {
          showBudget: project.show_budget !== false,
          showTimeTracking: project.show_time_tracking !== false,
          showTeamMembers: project.show_team_members !== false,
          showTaskDetails: project.show_task_details !== false,
          showTaskHours: project.show_task_hours !== false,
          allowComments: project.allow_comments !== false
        }
      },
      progress: {
        percent: progressPercent,
        totalTasks,
        completedTasks,
        remainingTasks: Number(taskStats?.remaining || 0)
      },
      tasks: project.show_task_details !== false ? tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.due_date,
        estimatedHours: project.show_task_hours !== false ? Number(t.estimated_hours || 0) : null,
        status: {
          id: t.status_id,
          name: t.status_name,
          color: t.status_color,
          isFinal: t.is_final
        },
        assigneeName: project.show_team_members !== false ? t.assignee_name : null,
        assigneeAvatar: project.show_team_members !== false ? t.assignee_avatar : null
      })) : [],
      milestones: milestones.map(m => ({
        id: m.id,
        title: m.title,
        dueDate: m.due_date,
        status: m.status,
        isCompleted: m.is_completed
      })),
      approvals: approvals.map(a => ({
        id: a.id,
        type: a.approval_type,
        title: a.title,
        status: a.status,
        dueDate: a.due_date,
        requestedAt: a.requested_at
      })),
      deliverables: deliverables.map(d => ({
        id: d.id,
        title: d.title,
        type: d.deliverable_type,
        thumbnailUrl: d.thumbnail_url,
        status: d.status,
        isFeatured: d.is_featured,
        publishedAt: d.published_at
      })),
      teamMembers: teamMembers.map(tm => ({
        id: tm.id,
        name: tm.name,
        role: tm.role,
        avatarUrl: tm.avatar_url
      })),
      timeTracking: timeTracking ? {
        totalHours: Number(timeTracking.total_hours || 0),
        billableHours: Number(timeTracking.billable_hours || 0)
      } : null,
      recentComments: comments.map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.created_at,
        authorName: c.client_user_name || c.team_member_name,
        authorType: c.client_user_name ? 'client' : 'team'
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch project:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project'
    })
  }
})
