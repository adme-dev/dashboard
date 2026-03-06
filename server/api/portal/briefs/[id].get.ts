/**
 * Client Portal - Get brief detail
 * GET /api/portal/briefs/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brief ID is required' })
  }

  try {
    // Get brief — scoped to client
    const brief = await queryOne(`
      SELECT
        b.*,
        bt.name AS template_name,
        bt.slug AS template_slug,
        bt.icon AS template_icon,
        bt.is_multi_step AS template_is_multi_step,
        bc.id AS category_id,
        bc.name AS category_name,
        bc.slug AS category_slug,
        bc.icon AS category_icon,
        bc.color AS category_color,
        am.name AS assignee_name,
        am.email AS assignee_email,
        p.name AS project_name
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      LEFT JOIN team_members am ON b.assigned_to = am.id
      LEFT JOIN projects p ON b.project_id = p.id
      WHERE b.id = $1 AND b.client_id = $2
    `, [id, clientUser.clientId])

    if (!brief) {
      throw createError({ statusCode: 404, statusMessage: 'Brief not found' })
    }

    // Get field values with labels
    const fieldValues = await queryRows(`
      SELECT
        bfv.id,
        bfv.field_id,
        bfv.value,
        btf.field_key,
        btf.field_label,
        btf.field_type,
        btf.step_number,
        btf.step_title,
        btf.section,
        btf.sort_order
      FROM brief_field_values bfv
      JOIN brief_template_fields btf ON bfv.field_id = btf.id
      WHERE bfv.brief_id = $1
      ORDER BY btf.step_number ASC, btf.sort_order ASC
    `, [id])

    // Get timeline / activity (non-sensitive items)
    const activities = await queryRows(`
      SELECT
        ba.id,
        ba.activity_type,
        ba.content,
        ba.created_at,
        tm.name AS user_name
      FROM brief_activities ba
      LEFT JOIN team_members tm ON ba.user_id = tm.id
      WHERE ba.brief_id = $1
      ORDER BY ba.created_at ASC
    `, [id])

    return {
      id: brief.id,
      templateId: brief.template_id,
      referenceNumber: brief.reference_number,
      title: brief.title,
      submittedByName: brief.submitted_by_name,
      submittedByEmail: brief.submitted_by_email,
      status: brief.status,
      priority: brief.priority,
      requestedDeadline: brief.requested_deadline,
      estimatedCompletion: brief.estimated_completion,
      reviewNotes: brief.review_notes,
      source: brief.source,
      createdAt: brief.created_at,
      updatedAt: brief.updated_at,
      submittedAt: brief.submitted_at,
      completedAt: brief.completed_at,
      template: {
        id: brief.template_id,
        name: brief.template_name,
        slug: brief.template_slug,
        icon: brief.template_icon,
        isMultiStep: brief.template_is_multi_step
      },
      category: {
        id: brief.category_id,
        name: brief.category_name,
        slug: brief.category_slug,
        icon: brief.category_icon,
        color: brief.category_color
      },
      assignee: brief.assigned_to ? {
        name: brief.assignee_name,
        email: brief.assignee_email
      } : null,
      project: brief.project_id ? {
        id: brief.project_id,
        name: brief.project_name
      } : null,
      fieldValues: fieldValues.map(fv => ({
        id: fv.id,
        fieldId: fv.field_id,
        fieldKey: fv.field_key,
        fieldLabel: fv.field_label,
        fieldType: fv.field_type,
        value: fv.value,
        stepNumber: fv.step_number,
        stepTitle: fv.step_title,
        section: fv.section
      })),
      timeline: activities.map(a => ({
        id: a.id,
        type: a.activity_type,
        content: a.content,
        userName: a.user_name,
        createdAt: a.created_at
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch portal brief:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch brief' })
  }
})
