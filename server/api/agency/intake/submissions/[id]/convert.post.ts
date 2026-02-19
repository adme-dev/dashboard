/**
 * Convert Intake Submission to Project
 * POST /api/agency/intake/submissions/:id/convert
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface ConvertSubmissionBody {
  projectName: string
  clientId: string
  budgetType?: 'fixed' | 'time_materials' | 'retainer_allocation' | 'media_commission'
  budgetAmount?: number
  startDate?: string
  endDate?: string
  projectManagerId?: string
  useTemplate?: boolean // Use form's associated template
  description?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const submissionId = getRouterParam(event, 'id')

  if (!submissionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Submission ID is required'
    })
  }

  const body = await readBody<ConvertSubmissionBody>(event)

  if (!body.projectName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name is required'
    })
  }

  if (!body.clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    // Get submission with form details
    const submission = await queryOne(`
      SELECT
        s.*,
        f.auto_project_template_id,
        f.default_department_id
      FROM intake_submissions s
      JOIN intake_forms f ON s.form_id = f.id
      WHERE s.id = $1
    `, [submissionId])

    if (!submission) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Submission not found'
      })
    }

    if (submission.status === 'converted') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Submission has already been converted to a project'
      })
    }

    // Verify client exists
    const client = await queryOne(`
      SELECT id, name FROM agency_clients WHERE id = $1
    `, [body.clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    let projectId: string

    // Use template if available and requested
    if (body.useTemplate && submission.auto_project_template_id) {
      // Use the database function to create from template
      const result = await queryOne(`
        SELECT create_project_from_template($1, $2, $3, $4, $5, $6) AS project_id
      `, [
        submission.auto_project_template_id,
        body.clientId,
        body.projectName,
        body.startDate || new Date().toISOString().split('T')[0],
        user.id,
        body.budgetAmount || null
      ])
      projectId = result.project_id
    } else {
      // Create project manually
      const project = await queryOne(`
        INSERT INTO projects (
          name,
          description,
          client_id,
          budget_type,
          budget_amount,
          start_date,
          end_date,
          status,
          project_manager_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
        RETURNING id
      `, [
        body.projectName,
        body.description || `Created from intake submission: ${submission.submitted_by_email}`,
        body.clientId,
        body.budgetType || 'time_materials',
        body.budgetAmount || 0,
        body.startDate || new Date().toISOString().split('T')[0],
        body.endDate || null,
        body.projectManagerId || null
      ])
      projectId = project.id
    }

    // Update submission status
    await queryOne(`
      UPDATE intake_submissions
      SET
        status = 'converted',
        client_id = $1,
        converted_to_project_id = $2,
        converted_at = NOW(),
        converted_by = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [body.clientId, projectId, user.id, submissionId])

    // Log activity
    await queryOne(`
      INSERT INTO intake_submission_activities (
        submission_id,
        activity_type,
        user_id,
        new_value
      ) VALUES ($1, 'converted', $2, $3)
    `, [submissionId, user.id, projectId])

    // Get created project details
    const project = await queryOne(`
      SELECT
        p.*,
        c.name AS client_name,
        pm.name AS project_manager_name
      FROM projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      WHERE p.id = $1
    `, [projectId])

    return {
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        client: {
          id: project.client_id,
          name: project.client_name
        },
        budgetType: project.budget_type,
        budgetAmount: project.budget_amount,
        startDate: project.start_date,
        endDate: project.end_date,
        status: project.status,
        projectManager: project.project_manager_id ? {
          id: project.project_manager_id,
          name: project.project_manager_name
        } : null,
        createdAt: project.created_at
      },
      message: `Successfully created project "${project.name}" from submission`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to convert submission:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to convert submission to project'
    })
  }
})
