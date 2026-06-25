/**
 * Create Project from Template
 * POST /api/agency/templates/:id/use
 *
 * Body:
 * - clientId: Client for the new project
 * - projectName: Name for the new project
 * - startDate: Project start date
 * - budgetOverride: Optional budget override
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const templateId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!templateId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template ID is required'
    })
  }

  const { clientId, projectName, startDate, budgetOverride } = body

  if (!clientId || !projectName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID and project name are required'
    })
  }

  try {
    // Get template
    const template = await queryOne(`
      SELECT * FROM project_templates WHERE id = $1 AND is_active = true
    `, [templateId])

    if (!template) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Template not found'
      })
    }

    // Verify client exists
    const client = await queryOne(`
      SELECT id, name FROM agency_clients WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    const projectStartDate = startDate ? new Date(startDate) : new Date()
    const projectEndDate = new Date(projectStartDate)
    projectEndDate.setDate(projectEndDate.getDate() + (template.estimated_duration_days || 30))

    // Create project
    const project = await queryOne(`
      INSERT INTO projects (
        name,
        client_id,
        status,
        budget_type,
        budget_amount,
        start_date,
        end_date,
        created_by
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      projectName,
      clientId,
      template.default_budget_type || 'time_materials',
      budgetOverride || template.default_budget_amount || 0,
      projectStartDate.toISOString().split('T')[0],
      projectEndDate.toISOString().split('T')[0],
      user.id
    ])

    // Get template tasks
    const templateTasks = await queryRows(`
      SELECT * FROM template_tasks
      WHERE template_id = $1
      ORDER BY phase_id NULLS FIRST, sort_order
    `, [templateId])

    // Create tasks from template
    const taskIdMap: Record<string, string> = {}

    for (const tt of templateTasks) {
      const dueDate = new Date(projectStartDate)
      dueDate.setDate(dueDate.getDate() + (tt.start_day_offset || 0) + (tt.duration_days || 1))

      const task = await queryOne(`
        INSERT INTO tasks (
          project_id,
          title,
          description,
          priority,
          task_type,
          estimated_hours,
          due_date,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        project.id,
        tt.title,
        tt.description,
        tt.priority || 'medium',
        tt.task_type || 'task',
        tt.estimated_hours,
        dueDate.toISOString().split('T')[0],
        user.id
      ])

      taskIdMap[tt.id] = task.id
    }

    // Update template usage stats
    await queryOne(`
      UPDATE project_templates
      SET times_used = times_used + 1, last_used_at = NOW()
      WHERE id = $1
    `, [templateId])

    // Record usage
    await queryOne(`
      INSERT INTO template_usage_history (template_id, project_id, used_by)
      VALUES ($1, $2, $3)
    `, [templateId, project.id, user.id])

    return {
      project: {
        id: project.id,
        name: project.name,
        clientId: project.client_id,
        clientName: client.name,
        status: project.status,
        budgetType: project.budget_type,
        budgetAmount: Number(project.budget_amount || 0),
        startDate: project.start_date,
        endDate: project.end_date,
        createdAt: project.created_at
      },
      tasksCreated: Object.keys(taskIdMap).length,
      templateUsed: {
        id: template.id,
        name: template.name
      }
    }
  } catch (error: unknown) {
    console.error('Failed to create project from template:', error)
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create project from template'
    })
  }
})
