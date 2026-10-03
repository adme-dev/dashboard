/**
 * Create Project from Template
 * POST /api/agency/templates/:id/use
 *
 * Body:
 * - clientId: Client for the new project
 * - projectName: Name for the new project
 * - startDate: Project start date
 * - budgetOverride: Optional budget override
 * - projectManagerId: Optional team member responsible for the project
 */

import { transaction } from '~~/server/utils/db'
import { validateTemplateTaskGraph, templateTaskDescription } from '~~/server/utils/briefConversion/taskGraph'
import { requireWriteAccess } from '~~/server/utils/auth'

const WORKFLOW_TASK_TYPES = new Set(['task', 'milestone', 'bug', 'feature', 'review', 'meeting'])

function normalizeWorkflowTaskType(taskType: unknown): string {
  if (typeof taskType !== 'string') return 'task'
  if (WORKFLOW_TASK_TYPES.has(taskType)) return taskType
  if (taskType === 'approval') return 'review'
  return 'task'
}

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

  const { clientId, projectName, startDate, budgetOverride, projectManagerId } = body

  if (!clientId || !projectName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID and project name are required'
    })
  }

  if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)) || new Date(startDate).toISOString().slice(0, 10) !== startDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a valid project start date' })
  }
  try {
    return await transaction(async (db) => {
      const queryRows = async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows
      const queryOne = async (sql: string, params?: unknown[]) => (await queryRows(sql, params))[0]
      // Get template
      const template = await queryOne(`
      SELECT * FROM project_templates WHERE id = $1 AND is_active = true FOR UPDATE
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

      if (projectManagerId) {
        const projectManager = await queryOne(`
        SELECT id, name
        FROM team_members
        WHERE id = $1 AND is_active = true
      `, [projectManagerId])

        if (!projectManager) {
          throw createError({
            statusCode: 404,
            statusMessage: 'Project manager not found'
          })
        }
      }

      const projectStartDate = startDate ? new Date(startDate) : new Date()
      const projectEndDate = new Date(projectStartDate)
      projectEndDate.setDate(projectEndDate.getDate() + (template.estimated_duration_days || 30))

      // Get template tasks and resolve workflow defaults before creating the project,
      // so template launch fails cleanly if task infrastructure is missing.
      const templateTasks = await queryRows(`
      SELECT * FROM template_tasks
      WHERE template_id = $1
      ORDER BY phase_id NULLS FIRST, sort_order
    `, [templateId])

      validateTemplateTaskGraph(templateTasks)

      let fallbackDepartmentId = template.department_id as string | null
      if (!fallbackDepartmentId && templateTasks.length > 0) {
        const fallbackDepartment = await queryOne(`
        SELECT id
        FROM departments
        WHERE is_active = true
        ORDER BY
          CASE slug
            WHEN 'marketing' THEN 0
            WHEN 'account-services' THEN 1
            ELSE 2
          END,
          sort_order,
          name
        LIMIT 1
      `)
        fallbackDepartmentId = fallbackDepartment?.id || null
      }

      const departmentIds = Array.from(new Set(
        templateTasks
          .map(tt => tt.default_department_id || fallbackDepartmentId)
          .filter(Boolean)
      ))

      if (templateTasks.length > 0 && departmentIds.length === 0) {
        throw createError({
          statusCode: 500,
          statusMessage: 'No workflow department is available for this template'
        })
      }

      const defaultStatusByDepartment = new Map<string, string>()
      for (const departmentId of departmentIds) {
        const defaultStatus = await queryOne(`
        SELECT id
        FROM task_statuses
        WHERE (department_id IS NULL OR department_id = $1)
          AND is_default = true
        ORDER BY department_id NULLS LAST
        LIMIT 1
      `, [departmentId])

        if (!defaultStatus?.id) {
          throw createError({
            statusCode: 500,
            statusMessage: 'No default workflow status is available for this template'
          })
        }

        defaultStatusByDepartment.set(departmentId, defaultStatus.id)
      }

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
        project_manager_id
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
      RETURNING *
    `, [
        projectName,
        clientId,
        template.default_budget_type || 'time_materials',
        budgetOverride || template.default_budget_amount || 0,
        projectStartDate.toISOString().split('T')[0],
        projectEndDate.toISOString().split('T')[0],
        projectManagerId || null
      ])

      // Create tasks from template
      const taskIdMap: Record<string, string> = {}

      for (const tt of templateTasks) {
        const taskStartDate = new Date(projectStartDate)
        taskStartDate.setUTCDate(taskStartDate.getUTCDate() + (tt.start_day_offset || 0))
        const dueDate = new Date(taskStartDate)
        dueDate.setUTCDate(dueDate.getUTCDate() + (tt.duration_days ?? 1))
        const departmentId = tt.default_department_id || fallbackDepartmentId
        const statusId = departmentId ? defaultStatusByDepartment.get(departmentId) : null

        const task = await queryOne(`
        INSERT INTO tasks (
          project_id,
          department_id,
          status_id,
          title,
          description,
          priority,
          task_type,
          estimated_hours,
          due_date,
          reporter_id,
          last_modified_by, start_date, is_billable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
          project.id,
          departmentId,
          statusId,
          tt.title,
          templateTaskDescription(tt.description, tt.checklist),
          tt.priority || 'medium',
          normalizeWorkflowTaskType(tt.task_type),
          tt.estimated_hours,
          dueDate.toISOString().split('T')[0],
          user.id,
          user.id,
          taskStartDate.toISOString().split('T')[0],
          tt.billable ?? true
        ])

        taskIdMap[tt.id] = task.id
      }

      for (const task of templateTasks) {
        if (task.parent_task_id) {
          await queryOne('UPDATE tasks SET parent_task_id=$1 WHERE id=$2', [taskIdMap[task.parent_task_id], taskIdMap[task.id]])
        }
        for (const dependency of new Set<string>(task.depends_on_task_ids || [])) {
          await queryOne('INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type) VALUES ($1,$2,\'blocks\')', [taskIdMap[task.id], taskIdMap[dependency]])
        }
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
          projectManagerId: project.project_manager_id,
          createdAt: project.created_at
        },
        tasksCreated: Object.keys(taskIdMap).length,
        templateUsed: {
          id: template.id,
          name: template.name
        }
      }
    })
  } catch (error: unknown) {
    console.error('Failed to create project from template:', error)
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create project from template'
    })
  }
})
