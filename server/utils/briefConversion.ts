/**
 * Brief → Project Conversion
 * Shared utility used by both the convert endpoint and auto-convert on approval.
 */

import { queryOne, queryRows, execute, transaction } from '~~/server/utils/db'

interface ConvertBriefOptions {
  briefId: string
  userId: string
  projectTemplateId?: string | null
  projectName?: string | null
  startDate?: string | null
  clientId?: string | null
}

interface ConvertBriefResult {
  project: { id: string; name: string }
  tasksCreated: number
}

export async function convertBriefToProject(opts: ConvertBriefOptions): Promise<ConvertBriefResult> {
  const { briefId, userId } = opts

  // 1. Get brief with template info
  const brief = await queryOne(`
    SELECT
      b.id, b.title, b.client_id, b.status, b.converted_to_project_id,
      b.requested_deadline, b.budget_min, b.budget_max, b.budget_currency,
      bt.project_template_id AS template_project_template_id,
      bt.field_mapping, bt.auto_convert_on_approval
    FROM briefs b
    JOIN brief_templates bt ON b.template_id = bt.id
    WHERE b.id = $1
  `, [briefId])

  if (!brief) {
    throw createError({ statusCode: 404, statusMessage: 'Brief not found' })
  }

  // 2. Verify brief status
  if (!['approved', 'in_progress'].includes(brief.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief must be approved or in progress to convert'
    })
  }

  // 3. Verify not already converted
  if (brief.converted_to_project_id) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Brief has already been converted to a project'
    })
  }

  // 4. Resolve params
  const projectTemplateId = opts.projectTemplateId || brief.template_project_template_id
  const projectName = opts.projectName || brief.title || 'Untitled Project'
  const clientId = opts.clientId || brief.client_id
  const startDate = opts.startDate || new Date().toISOString().split('T')[0]

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required (either from brief or request body)'
    })
  }

  // Verify client exists
  const client = await queryOne('SELECT id, name FROM agency_clients WHERE id = $1', [clientId])
  if (!client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }

  // 5. Create project (with or without template)
  if (projectTemplateId) {
    // Use transaction for template-based creation
    const result = await transaction(async (txClient) => {
      // Get template
      const templateResult = await txClient.query(
        'SELECT * FROM project_templates WHERE id = $1 AND is_active = true',
        [projectTemplateId]
      )
      const template = templateResult.rows[0]

      if (!template) {
        throw createError({ statusCode: 404, statusMessage: 'Project template not found' })
      }

      const projectStartDate = new Date(startDate)
      const projectEndDate = new Date(projectStartDate)
      projectEndDate.setDate(projectEndDate.getDate() + (template.estimated_duration_days || 30))

      // Create project
      const projectResult = await txClient.query(`
        INSERT INTO projects (
          name, client_id, status, budget_type, budget_amount,
          start_date, end_date, project_manager_id
        ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
        RETURNING id, name
      `, [
        projectName,
        clientId,
        template.default_budget_type || 'time_materials',
        template.default_budget_amount || 0,
        projectStartDate.toISOString().split('T')[0],
        projectEndDate.toISOString().split('T')[0],
        userId
      ])
      const project = projectResult.rows[0]

      // Get template tasks
      const tasksResult = await txClient.query(`
        SELECT * FROM template_tasks
        WHERE template_id = $1
        ORDER BY phase_id NULLS FIRST, sort_order
      `, [projectTemplateId])
      const templateTasks = tasksResult.rows

      // Create tasks from template
      let tasksCreated = 0
      for (const tt of templateTasks) {
        const dueDate = new Date(projectStartDate)
        dueDate.setDate(dueDate.getDate() + (tt.start_day_offset || 0) + (tt.duration_days || 1))

        await txClient.query(`
          INSERT INTO tasks (
            project_id, title, description, priority,
            task_type, estimated_hours, due_date, reporter_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          project.id,
          tt.title,
          tt.description,
          tt.priority || 'medium',
          tt.task_type || 'task',
          tt.estimated_hours,
          dueDate.toISOString().split('T')[0],
          userId
        ])
        tasksCreated++
      }

      // Update template usage stats
      await txClient.query(`
        UPDATE project_templates
        SET times_used = COALESCE(times_used, 0) + 1, last_used_at = NOW()
        WHERE id = $1
      `, [projectTemplateId])

      // Update brief
      await txClient.query(`
        UPDATE briefs
        SET converted_to_project_id = $1, converted_at = NOW(), auto_project_created = true, updated_at = NOW()
        WHERE id = $2
      `, [project.id, briefId])

      // Log activity
      await txClient.query(`
        INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
        VALUES ($1, $2, 'converted', $3, $4)
      `, [
        briefId,
        userId,
        JSON.stringify({ projectId: project.id, templateId: projectTemplateId }),
        `Converted to project "${project.name}" using template`
      ])

      return { project: { id: project.id, name: project.name }, tasksCreated }
    })

    return result
  } else {
    // Simple project creation (no template)
    const projectStartDate = new Date(startDate)
    const projectEndDate = new Date(projectStartDate)
    projectEndDate.setDate(projectEndDate.getDate() + 30)

    const project = await queryOne(`
      INSERT INTO projects (
        name, client_id, status, budget_type, budget_amount,
        start_date, end_date, project_manager_id
      ) VALUES ($1, $2, 'active', 'time_materials', 0, $3, $4, $5)
      RETURNING id, name
    `, [
      projectName,
      clientId,
      projectStartDate.toISOString().split('T')[0],
      projectEndDate.toISOString().split('T')[0],
      userId
    ])

    // Update brief
    await execute(`
      UPDATE briefs
      SET converted_to_project_id = $1, converted_at = NOW(), auto_project_created = false, updated_at = NOW()
      WHERE id = $2
    `, [project.id, briefId])

    // Log activity
    await execute(`
      INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
      VALUES ($1, $2, 'converted', $3, $4)
    `, [
      briefId,
      userId,
      JSON.stringify({ projectId: project.id }),
      `Converted to project "${project.name}"`
    ])

    return { project: { id: project.id, name: project.name }, tasksCreated: 0 }
  }
}
