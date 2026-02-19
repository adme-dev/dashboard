/**
 * List Intake Submissions
 * GET /api/agency/intake/submissions
 *
 * Query params:
 * - formId: Filter by form
 * - status: Filter by status
 * - assignedTo: Filter by assignee
 * - priority: Filter by priority
 * - search: Search by name/email/company
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  if (query.formId) {
    conditions.push(`s.form_id = $${idx++}`)
    params.push(query.formId)
  }

  if (query.status) {
    conditions.push(`s.status = $${idx++}`)
    params.push(query.status)
  }

  if (query.assignedTo) {
    conditions.push(`s.assigned_to = $${idx++}`)
    params.push(query.assignedTo)
  }

  if (query.priority) {
    conditions.push(`s.priority = $${idx++}`)
    params.push(query.priority)
  }

  if (query.search) {
    conditions.push(`(
      s.submitted_by_name ILIKE $${idx} OR
      s.submitted_by_email ILIKE $${idx} OR
      s.submitted_by_company ILIKE $${idx}
    )`)
    params.push(`%${query.search}%`)
    idx++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  params.push(limit, offset)

  try {
    const submissions = await queryRows(`
      SELECT
        s.id,
        s.form_id,
        f.name AS form_name,
        s.client_id,
        c.name AS client_name,
        s.submitted_by_name,
        s.submitted_by_email,
        s.submitted_by_company,
        s.data,
        s.status,
        s.priority,
        s.assigned_to,
        assignee.name AS assigned_to_name,
        s.reviewed_by,
        reviewer.name AS reviewed_by_name,
        s.converted_to_project_id,
        p.name AS project_name,
        s.source,
        s.created_at,
        s.updated_at,
        COALESCE(attachments.count, 0) AS attachment_count
      FROM intake_submissions s
      JOIN intake_forms f ON s.form_id = f.id
      LEFT JOIN agency_clients c ON s.client_id = c.id
      LEFT JOIN team_members assignee ON s.assigned_to = assignee.id
      LEFT JOIN team_members reviewer ON s.reviewed_by = reviewer.id
      LEFT JOIN projects p ON s.converted_to_project_id = p.id
      LEFT JOIN (
        SELECT submission_id, COUNT(*) AS count
        FROM intake_submission_attachments
        GROUP BY submission_id
      ) attachments ON s.id = attachments.submission_id
      ${whereClause}
      ORDER BY
        CASE s.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        s.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params)

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) AS total
      FROM intake_submissions s
      ${whereClause}
    `, params.slice(0, -2))

    // Get status counts
    const statusCounts = await queryRows(`
      SELECT status, COUNT(*) AS count
      FROM intake_submissions s
      ${conditions.length > 0 && query.formId ? `WHERE s.form_id = $1` : ''}
      GROUP BY status
    `, query.formId ? [query.formId] : [])

    return {
      submissions: submissions.map(s => ({
        id: s.id,
        formId: s.form_id,
        formName: s.form_name,
        client: s.client_id ? {
          id: s.client_id,
          name: s.client_name
        } : null,
        submittedBy: {
          name: s.submitted_by_name,
          email: s.submitted_by_email,
          company: s.submitted_by_company
        },
        data: s.data,
        status: s.status,
        priority: s.priority,
        assignedTo: s.assigned_to ? {
          id: s.assigned_to,
          name: s.assigned_to_name
        } : null,
        reviewedBy: s.reviewed_by ? {
          id: s.reviewed_by,
          name: s.reviewed_by_name
        } : null,
        convertedProject: s.converted_to_project_id ? {
          id: s.converted_to_project_id,
          name: s.project_name
        } : null,
        source: s.source,
        attachmentCount: Number(s.attachment_count),
        createdAt: s.created_at,
        updatedAt: s.updated_at
      })),
      total: Number(countResult?.total || 0),
      statusCounts: statusCounts.reduce((acc, s) => {
        acc[s.status] = Number(s.count)
        return acc
      }, {} as Record<string, number>),
      limit,
      offset
    }
  } catch (error) {
    console.error('Failed to fetch submissions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch submissions'
    })
  }
})
