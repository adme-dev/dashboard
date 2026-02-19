/**
 * Get Intake Submission Details
 * GET /api/agency/intake/submissions/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const submissionId = getRouterParam(event, 'id')

  if (!submissionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Submission ID is required'
    })
  }

  try {
    const submission = await queryOne(`
      SELECT
        s.*,
        f.name AS form_name,
        f.slug AS form_slug,
        c.name AS client_name,
        assignee.name AS assigned_to_name,
        assignee.email AS assigned_to_email,
        reviewer.name AS reviewed_by_name,
        converter.name AS converted_by_name,
        p.name AS project_name
      FROM intake_submissions s
      JOIN intake_forms f ON s.form_id = f.id
      LEFT JOIN agency_clients c ON s.client_id = c.id
      LEFT JOIN team_members assignee ON s.assigned_to = assignee.id
      LEFT JOIN team_members reviewer ON s.reviewed_by = reviewer.id
      LEFT JOIN team_members converter ON s.converted_by = converter.id
      LEFT JOIN projects p ON s.converted_to_project_id = p.id
      WHERE s.id = $1
    `, [submissionId])

    if (!submission) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Submission not found'
      })
    }

    // Get form fields to label the data
    const fields = await queryRows(`
      SELECT field_key, label, field_type
      FROM intake_form_fields
      WHERE form_id = $1
      ORDER BY sort_order
    `, [submission.form_id])

    // Get attachments
    const attachments = await queryRows(`
      SELECT *
      FROM intake_submission_attachments
      WHERE submission_id = $1
      ORDER BY created_at
    `, [submissionId])

    // Get activity history
    const activities = await queryRows(`
      SELECT
        a.*,
        tm.name AS user_name
      FROM intake_submission_activities a
      LEFT JOIN team_members tm ON a.user_id = tm.id
      WHERE a.submission_id = $1
      ORDER BY a.created_at DESC
      LIMIT 50
    `, [submissionId])

    // Format data with field labels
    const formattedData: Array<{ key: string; label: string; value: any; type: string }> = []
    const dataObj = submission.data || {}

    for (const field of fields) {
      if (field.field_type !== 'heading' && field.field_type !== 'paragraph' && field.field_type !== 'divider') {
        formattedData.push({
          key: field.field_key,
          label: field.label,
          value: dataObj[field.field_key],
          type: field.field_type
        })
      }
    }

    return {
      submission: {
        id: submission.id,
        form: {
          id: submission.form_id,
          name: submission.form_name,
          slug: submission.form_slug
        },
        client: submission.client_id ? {
          id: submission.client_id,
          name: submission.client_name
        } : null,
        submittedBy: {
          name: submission.submitted_by_name,
          email: submission.submitted_by_email,
          phone: submission.submitted_by_phone,
          company: submission.submitted_by_company
        },
        data: formattedData,
        rawData: submission.data,
        status: submission.status,
        priority: submission.priority,
        assignedTo: submission.assigned_to ? {
          id: submission.assigned_to,
          name: submission.assigned_to_name,
          email: submission.assigned_to_email
        } : null,
        assignedAt: submission.assigned_at,
        reviewedBy: submission.reviewed_by ? {
          id: submission.reviewed_by,
          name: submission.reviewed_by_name
        } : null,
        reviewedAt: submission.reviewed_at,
        reviewNotes: submission.review_notes,
        convertedProject: submission.converted_to_project_id ? {
          id: submission.converted_to_project_id,
          name: submission.project_name
        } : null,
        convertedAt: submission.converted_at,
        convertedBy: submission.converted_by ? {
          id: submission.converted_by,
          name: submission.converted_by_name
        } : null,
        source: submission.source,
        referrerUrl: submission.referrer_url,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at
      },
      attachments: attachments.map(a => ({
        id: a.id,
        fieldKey: a.field_key,
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileType: a.file_type,
        fileSize: a.file_size,
        createdAt: a.created_at
      })),
      activities: activities.map(a => ({
        id: a.id,
        type: a.activity_type,
        userId: a.user_id,
        userName: a.user_name,
        oldValue: a.old_value,
        newValue: a.new_value,
        comment: a.comment,
        createdAt: a.created_at
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch submission:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch submission'
    })
  }
})
