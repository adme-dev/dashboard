/**
 * Update Intake Submission
 * PUT /api/agency/intake/submissions/:id
 *
 * Update status, assignment, priority, notes
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateSubmissionBody {
  status?: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'converted' | 'archived'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  assignedTo?: string | null
  reviewNotes?: string
  clientId?: string | null
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

  const body = await readBody<UpdateSubmissionBody>(event)

  try {
    // Get existing submission
    const existing = await queryOne(`
      SELECT id, status, priority, assigned_to, client_id
      FROM intake_submissions WHERE id = $1
    `, [submissionId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Submission not found'
      })
    }

    const updates: string[] = []
    const params: any[] = []
    let idx = 1
    const activities: Array<{ type: string; oldValue: string; newValue: string }> = []

    if (body.status !== undefined && body.status !== existing.status) {
      updates.push(`status = $${idx++}`)
      params.push(body.status)
      activities.push({
        type: 'status_change',
        oldValue: existing.status,
        newValue: body.status
      })

      // Set reviewed fields if approving/rejecting
      if (body.status === 'approved' || body.status === 'rejected') {
        updates.push(`reviewed_by = $${idx++}`)
        params.push(user.id)
        updates.push(`reviewed_at = NOW()`)
      }
    }

    if (body.priority !== undefined && body.priority !== existing.priority) {
      updates.push(`priority = $${idx++}`)
      params.push(body.priority)
      activities.push({
        type: 'priority_change',
        oldValue: existing.priority,
        newValue: body.priority
      })
    }

    if (body.assignedTo !== undefined && body.assignedTo !== existing.assigned_to) {
      updates.push(`assigned_to = $${idx++}`)
      params.push(body.assignedTo)
      updates.push(`assigned_at = ${body.assignedTo ? 'NOW()' : 'NULL'}`)
      activities.push({
        type: 'assigned',
        oldValue: existing.assigned_to || 'unassigned',
        newValue: body.assignedTo || 'unassigned'
      })
    }

    if (body.reviewNotes !== undefined) {
      updates.push(`review_notes = $${idx++}`)
      params.push(body.reviewNotes)
    }

    if (body.clientId !== undefined) {
      updates.push(`client_id = $${idx++}`)
      params.push(body.clientId)
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes provided'
      }
    }

    updates.push('updated_at = NOW()')
    params.push(submissionId)

    const submission = await queryOne(`
      UPDATE intake_submissions
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    // Log activities
    for (const activity of activities) {
      await queryOne(`
        INSERT INTO intake_submission_activities (
          submission_id,
          activity_type,
          user_id,
          old_value,
          new_value
        ) VALUES ($1, $2, $3, $4, $5)
      `, [submissionId, activity.type, user.id, activity.oldValue, activity.newValue])
    }

    return {
      success: true,
      submission: {
        id: submission.id,
        status: submission.status,
        priority: submission.priority,
        assignedTo: submission.assigned_to,
        reviewNotes: submission.review_notes,
        updatedAt: submission.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update submission:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update submission'
    })
  }
})
