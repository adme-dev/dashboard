/**
 * List Intake Forms
 * GET /api/agency/intake/forms
 *
 * Query params:
 * - active: Filter by active status
 * - departmentId: Filter by department
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  if (query.active !== undefined) {
    conditions.push(`f.is_active = $${idx++}`)
    params.push(query.active === 'true')
  }

  if (query.departmentId) {
    conditions.push(`f.default_department_id = $${idx++}`)
    params.push(query.departmentId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const forms = await queryRows(`
      SELECT
        f.id,
        f.name,
        f.slug,
        f.description,
        f.is_active,
        f.is_public,
        f.requires_client_login,
        f.auto_create_project,
        f.primary_color,
        f.created_at,
        f.updated_at,
        d.id AS department_id,
        d.name AS department_name,
        tm.name AS created_by_name,
        pt.name AS template_name,
        COALESCE(fields.count, 0) AS field_count,
        COALESCE(submissions.total, 0) AS total_submissions,
        COALESCE(submissions.pending, 0) AS pending_submissions,
        submissions.last_submission_at
      FROM intake_forms f
      LEFT JOIN departments d ON f.default_department_id = d.id
      LEFT JOIN team_members tm ON f.created_by = tm.id
      LEFT JOIN project_templates pt ON f.auto_project_template_id = pt.id
      LEFT JOIN (
        SELECT form_id, COUNT(*) AS count
        FROM intake_form_fields
        GROUP BY form_id
      ) fields ON f.id = fields.form_id
      LEFT JOIN (
        SELECT
          form_id,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          MAX(created_at) AS last_submission_at
        FROM intake_submissions
        GROUP BY form_id
      ) submissions ON f.id = submissions.form_id
      ${whereClause}
      ORDER BY f.created_at DESC
    `, params)

    return {
      forms: forms.map(f => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        description: f.description,
        isActive: f.is_active,
        isPublic: f.is_public,
        requiresClientLogin: f.requires_client_login,
        autoCreateProject: f.auto_create_project,
        primaryColor: f.primary_color,
        department: f.department_id ? {
          id: f.department_id,
          name: f.department_name
        } : null,
        templateName: f.template_name,
        createdByName: f.created_by_name,
        fieldCount: Number(f.field_count),
        totalSubmissions: Number(f.total_submissions),
        pendingSubmissions: Number(f.pending_submissions),
        lastSubmissionAt: f.last_submission_at,
        createdAt: f.created_at,
        updatedAt: f.updated_at
      }))
    }
  } catch (error) {
    console.error('Failed to fetch intake forms:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch intake forms'
    })
  }
})
