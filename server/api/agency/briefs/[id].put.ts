/**
 * Update Brief
 * PUT /api/agency/briefs/:id
 *
 * Updates an existing brief's details and field values
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { notifyBriefAssigneeChanged } from '~~/server/utils/briefNotifications'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { maybeAcknowledgeBrief } from '~~/server/utils/automation/actionedConfirmationRunner'

interface UpdateBriefBody {
  title?: string
  clientId?: string | null
  projectId?: string | null
  departmentId?: string | null
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  assignedTo?: string | null
  requestedDeadline?: string | null
  estimatedCompletion?: string | null
  budgetMin?: number | null
  budgetMax?: number | null
  budgetCurrency?: string
  fieldValues?: Record<string, any>
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const briefId = getRouterParam(event, 'id')
  const body = await readBody<UpdateBriefBody>(event)

  if (!briefId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief ID is required'
    })
  }

  try {
    // Check if brief exists (also pull fields needed for the assignment notification)
    const brief = await queryOne(
      `SELECT id, template_id, status, assigned_to, title, reference_number FROM briefs WHERE id = $1`,
      [briefId]
    )

    if (!brief) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Brief not found'
      })
    }

    // Don't allow editing completed or cancelled briefs
    if (['completed', 'cancelled'].includes(brief.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot edit a ${brief.status} brief`
      })
    }

    // Build dynamic update for brief fields
    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.title !== undefined) {
      fields.push(`title = $${idx}`)
      values.push(body.title?.trim() || null)
      idx++
    }

    if (body.clientId !== undefined) {
      fields.push(`client_id = $${idx}`)
      values.push(body.clientId || null)
      idx++
    }

    if (body.projectId !== undefined) {
      fields.push(`project_id = $${idx}`)
      values.push(body.projectId || null)
      idx++
    }

    if (body.departmentId !== undefined) {
      fields.push(`department_id = $${idx}`)
      values.push(body.departmentId || null)
      idx++
    }

    if (body.priority !== undefined) {
      if (!['low', 'normal', 'high', 'urgent'].includes(body.priority)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid priority level'
        })
      }
      fields.push(`priority = $${idx}`)
      values.push(body.priority)
      idx++
    }

    if (body.assignedTo !== undefined) {
      fields.push(`assigned_to = $${idx}`)
      values.push(body.assignedTo || null)
      idx++
      if (body.assignedTo) {
        fields.push(`assigned_at = NOW()`)
      }
    }

    if (body.requestedDeadline !== undefined) {
      fields.push(`requested_deadline = $${idx}`)
      values.push(body.requestedDeadline || null)
      idx++
    }

    if (body.estimatedCompletion !== undefined) {
      fields.push(`estimated_completion = $${idx}`)
      values.push(body.estimatedCompletion || null)
      idx++
    }

    if (body.budgetMin !== undefined) {
      fields.push(`budget_min = $${idx}`)
      values.push(body.budgetMin || null)
      idx++
    }

    if (body.budgetMax !== undefined) {
      fields.push(`budget_max = $${idx}`)
      values.push(body.budgetMax || null)
      idx++
    }

    if (body.budgetCurrency !== undefined) {
      fields.push(`budget_currency = $${idx}`)
      values.push(body.budgetCurrency || 'USD')
      idx++
    }

    await transaction(async (client) => {
      // Update brief fields if any
      if (fields.length > 0) {
        values.push(briefId)
        await client.query(`
          UPDATE briefs
          SET ${fields.join(', ')}, updated_at = NOW()
          WHERE id = $${idx}
        `, values)
      }

      // Update field values if provided
      if (body.fieldValues && Object.keys(body.fieldValues).length > 0) {
        // Get template fields for this brief
        const templateFields = await queryRows(`
          SELECT btf.id, btf.field_key
          FROM brief_template_fields btf
          JOIN briefs b ON b.template_id = btf.template_id
          WHERE b.id = $1
        `, [briefId])

        const fieldKeyToId = new Map(templateFields.map(f => [f.field_key, f.id]))

        // Update or insert each field value
        for (const [fieldKey, value] of Object.entries(body.fieldValues)) {
          const fieldId = fieldKeyToId.get(fieldKey)
          if (!fieldId) continue // Skip unknown fields

          const jsonValue = JSON.stringify(value)

          // Upsert field value
          await client.query(`
            INSERT INTO brief_field_values (brief_id, field_id, value)
            VALUES ($1, $2, $3)
            ON CONFLICT (brief_id, field_id)
            DO UPDATE SET value = $3, updated_at = NOW()
          `, [briefId, fieldId, jsonValue])
        }
      }

      // Log activity
      await client.query(`
        INSERT INTO brief_activities (brief_id, user_id, activity_type, metadata)
        VALUES ($1, $2, 'updated', $3)
      `, [briefId, user.id, JSON.stringify({ updatedFields: Object.keys(body) })])
    })

    // Notify the new assignee (helper handles unchanged/unassign/self skips).
    // runAfterResponse keeps the work alive past the HTTP response on CF.
    if (body.assignedTo !== undefined) {
      runAfterResponse(event, notifyBriefAssigneeChanged({
        briefId: briefId!,
        briefTitle: brief.title,
        referenceNumber: brief.reference_number,
        oldAssigneeId: brief.assigned_to,
        newAssigneeId: body.assignedTo || null,
        actorId: user.id
      }), 'notifyBriefAssigneeChanged')
    }

    // C7: confirm to the briefer once the brief is first actioned (flag-gated, fail-open).
    await maybeAcknowledgeBrief(briefId)

    // Return updated brief
    const updated = await queryOne(`
      SELECT
        b.*,
        bt.name AS template_name,
        bt.slug AS template_slug
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE b.id = $1
    `, [briefId])

    return {
      success: true,
      message: 'Brief updated successfully',
      brief: {
        id: updated.id,
        templateId: updated.template_id,
        templateName: updated.template_name,
        templateSlug: updated.template_slug,
        referenceNumber: updated.reference_number,
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        clientId: updated.client_id,
        projectId: updated.project_id,
        departmentId: updated.department_id,
        assignedTo: updated.assigned_to,
        requestedDeadline: updated.requested_deadline,
        estimatedCompletion: updated.estimated_completion,
        budgetMin: updated.budget_min,
        budgetMax: updated.budget_max,
        budgetCurrency: updated.budget_currency,
        updatedAt: updated.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update brief:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update brief'
    })
  }
})
