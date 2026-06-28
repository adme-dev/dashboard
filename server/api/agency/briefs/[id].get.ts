/**
 * Get single brief with all details
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief ID is required'
    })
  }

  try {
    // Get brief
    const brief = await queryOne(`
      SELECT
        b.*,
        -- Template
        bt.name AS template_name,
        bt.slug AS template_slug,
        bt.icon AS template_icon,
        bt.is_multi_step AS template_is_multi_step,
        -- Category
        bc.id AS category_id,
        bc.name AS category_name,
        bc.slug AS category_slug,
        bc.icon AS category_icon,
        bc.color AS category_color,
        -- Submitter
        sm.name AS submitter_name,
        sm.email AS submitter_email,
        -- Assignee
        am.name AS assignee_name,
        am.email AS assignee_email,
        -- Reviewer
        rm.name AS reviewer_name,
        rm.email AS reviewer_email,
        -- Client
        c.name AS client_name,
        -- Project
        p.name AS project_name,
        -- Department
        d.name AS department_name,
        d.color AS department_color
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      LEFT JOIN team_members sm ON b.submitted_by = sm.id
      LEFT JOIN team_members am ON b.assigned_to = am.id
      LEFT JOIN team_members rm ON b.reviewed_by = rm.id
      LEFT JOIN agency_clients c ON b.client_id = c.id
      LEFT JOIN projects p ON b.project_id = p.id
      LEFT JOIN departments d ON b.department_id = d.id
      WHERE b.id = $1
    `, [id])

    if (!brief) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Brief not found'
      })
    }

    // Get field values with field definitions
    const fieldValues = await queryRows(`
      SELECT
        bfv.id,
        bfv.brief_id,
        bfv.field_id,
        bfv.value,
        bfv.created_at,
        bfv.updated_at,
        btf.field_key,
        btf.field_label,
        btf.field_type,
        btf.step_number,
        btf.section,
        btf.sort_order
      FROM brief_field_values bfv
      JOIN brief_template_fields btf ON bfv.field_id = btf.id
      WHERE bfv.brief_id = $1
      ORDER BY btf.step_number ASC, btf.sort_order ASC
    `, [id])

    // Get linked quote (if any)
    let quoteData = null
    if (brief.quote_id) {
      const q = await queryOne(`
        SELECT id, quote_number, status, total, currency,
               xero_quote_number, xero_status
        FROM quotes WHERE id = $1
      `, [brief.quote_id])
      if (q) {
        quoteData = {
          id: q.id,
          quoteNumber: q.quote_number,
          status: q.status,
          total: Number(q.total),
          currency: q.currency,
          xeroQuoteNumber: q.xero_quote_number,
          xeroStatus: q.xero_status,
        }
      }
    }

    // Get tasks linked to this brief
    let briefLinkedTasks: any[] = []
    try {
      briefLinkedTasks = await queryRows(`
        SELECT t.id, t.title,
               ts.name AS status_name, ts.color AS status_color, ts.is_final,
               d.name AS board_name,
               t.assignee_id, am.name AS assignee_name,
               t.actual_hours, t.estimated_hours, t.budget_source
        FROM tasks t
        JOIN task_statuses ts ON t.status_id = ts.id
        JOIN departments d ON t.department_id = d.id
        LEFT JOIN team_members am ON t.assignee_id = am.id
        WHERE t.brief_id = $1
        ORDER BY t.created_at
      `, [id])
    } catch { /* graceful degradation */ }

    // Get attachments
    const attachments = await queryRows(`
      SELECT
        ba.*,
        tm.name AS uploader_name
      FROM brief_attachments ba
      LEFT JOIN team_members tm ON ba.uploaded_by = tm.id
      WHERE ba.brief_id = $1
      ORDER BY ba.created_at DESC
    `, [id])

    return {
      id: brief.id,
      templateId: brief.template_id,
      referenceNumber: brief.reference_number,
      title: brief.title,
      submittedBy: brief.submitted_by,
      submittedByName: brief.submitted_by_name,
      submittedByEmail: brief.submitted_by_email,
      clientId: brief.client_id,
      projectId: brief.project_id,
      departmentId: brief.department_id,
      status: brief.status,
      priority: brief.priority,
      assignedTo: brief.assigned_to,
      assignedAt: brief.assigned_at,
      reviewedBy: brief.reviewed_by,
      reviewedAt: brief.reviewed_at,
      reviewNotes: brief.review_notes,
      convertedToTaskId: brief.converted_to_task_id,
      convertedToProjectId: brief.converted_to_project_id,
      convertedAt: brief.converted_at,
      requestedDeadline: brief.requested_deadline,
      estimatedCompletion: brief.estimated_completion,
      budgetMin: brief.budget_min,
      budgetMax: brief.budget_max,
      budgetCurrency: brief.budget_currency,
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
      submitter: brief.submitted_by ? {
        id: brief.submitted_by,
        name: brief.submitter_name,
        email: brief.submitter_email
      } : (brief.submitted_by_name ? {
        name: brief.submitted_by_name,
        email: brief.submitted_by_email
      } : null),
      assignee: brief.assigned_to ? {
        id: brief.assigned_to,
        name: brief.assignee_name,
        email: brief.assignee_email
      } : null,
      reviewer: brief.reviewed_by ? {
        id: brief.reviewed_by,
        name: brief.reviewer_name,
        email: brief.reviewer_email
      } : null,
      client: brief.client_id ? {
        id: brief.client_id,
        name: brief.client_name
      } : null,
      project: brief.project_id ? {
        id: brief.project_id,
        name: brief.project_name
      } : null,
      department: brief.department_id ? {
        id: brief.department_id,
        name: brief.department_name,
        color: brief.department_color
      } : null,
      quote: quoteData,
      linkedTasks: briefLinkedTasks.map(t => ({
        id: t.id,
        title: t.title,
        statusName: t.status_name,
        statusColor: t.status_color,
        isFinal: !!t.is_final,
        boardName: t.board_name,
        assigneeId: t.assignee_id,
        assigneeName: t.assignee_name,
        actualHours: t.actual_hours ? Number(t.actual_hours) : null,
        estimatedHours: t.estimated_hours ? Number(t.estimated_hours) : null,
        budgetSource: t.budget_source || 'manual',
      })),
      fieldValues: fieldValues.map(fv => ({
        id: fv.id,
        briefId: fv.brief_id,
        fieldId: fv.field_id,
        fieldKey: fv.field_key,
        fieldLabel: fv.field_label,
        fieldType: fv.field_type,
        value: fv.value,
        stepNumber: fv.step_number,
        section: fv.section,
        createdAt: fv.created_at,
        updatedAt: fv.updated_at
      })),
      attachments: attachments.map(a => ({
        id: a.id,
        briefId: a.brief_id,
        fieldId: a.field_id,
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileType: a.file_type,
        fileSize: a.file_size,
        thumbnailUrl: a.thumbnail_url,
        uploadedBy: a.uploaded_by,
        uploadedByName: a.uploader_name,
        createdAt: a.created_at
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch brief:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch brief'
    })
  }
})
