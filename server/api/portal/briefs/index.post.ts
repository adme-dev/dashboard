/**
 * Client Portal - Submit a new brief
 * POST /api/portal/briefs
 */

import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { runBriefGatekeeper } from '~~/server/utils/automation/briefGatekeeperRunner'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  // Check permission
  if (!clientUser.permissions.canSubmitRequests) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to submit briefs' })
  }

  const body = await readBody(event)

  const {
    templateId,
    title,
    fieldValues,
    priority,
    requestedDeadline
  } = body

  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  if (!title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }

  try {
    // Verify template exists, is active, and is public
    const template = await queryOne(`
      SELECT
        id, default_priority, requires_approval,
        auto_assign_to, auto_assign_department, require_client_link
      FROM brief_templates
      WHERE id = $1 AND is_active = true AND is_public = true
    `, [templateId])

    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found or not available' })
    }

    // Validate required fields
    if (fieldValues) {
      const requiredFields = await queryRows(`
        SELECT field_key, field_label, is_required
        FROM brief_template_fields
        WHERE template_id = $1 AND is_required = true
      `, [templateId])

      const missingFields = requiredFields.filter(f => {
        const value = fieldValues[f.field_key]
        return value === undefined || value === null || value === '' ||
               (Array.isArray(value) && value.length === 0)
      })

      if (missingFields.length > 0) {
        throw createError({
          statusCode: 400,
          statusMessage: `Missing required fields: ${missingFields.map(f => f.field_label).join(', ')}`
        })
      }
    }

    // Determine department and assignee from template
    const departmentId = template.auto_assign_department || null
    const assignedTo = template.auto_assign_to || null

    // Create brief — always submitted (no drafts from portal)
    const brief = await queryOne(`
      INSERT INTO briefs (
        template_id,
        title,
        submitted_by_name,
        submitted_by_email,
        client_id,
        department_id,
        status,
        priority,
        assigned_to,
        assigned_at,
        requested_deadline,
        source,
        submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      templateId,
      title.trim(),
      clientUser.name,
      clientUser.email,
      clientUser.clientId,
      departmentId,
      'submitted',
      priority || template.default_priority || 'medium',
      assignedTo,
      assignedTo ? new Date().toISOString() : null,
      requestedDeadline || null,
      'client_portal',
      new Date().toISOString()
    ])

    // Save field values
    if (fieldValues && Object.keys(fieldValues).length > 0) {
      const fields = await queryRows(`
        SELECT id, field_key
        FROM brief_template_fields
        WHERE template_id = $1
      `, [templateId])

      const fieldMap = new Map(fields.map(f => [f.field_key, f.id]))

      for (const [fieldKey, value] of Object.entries(fieldValues)) {
        const fieldId = fieldMap.get(fieldKey)
        if (fieldId && value !== undefined && value !== null && value !== '') {
          await execute(`
            INSERT INTO brief_field_values (brief_id, field_id, value)
            VALUES ($1, $2, $3)
          `, [brief.id, fieldId, JSON.stringify(value)])
        }
      }
    }

    // Create activity log
    await execute(`
      INSERT INTO brief_activities (brief_id, activity_type, content)
      VALUES ($1, $2, $3)
    `, [
      brief.id,
      'submitted',
      `Brief submitted via client portal by ${clientUser.name}`
    ])

    // Add assignee as watcher
    if (assignedTo) {
      await execute(`
        INSERT INTO brief_watchers (brief_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (brief_id, user_id) DO NOTHING
      `, [brief.id, assignedTo])
    }

    // C5 brief-completeness gatekeeper (DORMANT — only acts when BRIEF_GATEKEEPER_ENABLED).
    // Portal briefs are always submitted; field values are inserted above. Fail-open.
    try {
      await runBriefGatekeeper(brief.id)
    } catch (gkError) {
      console.error('[Brief] Gatekeeper failed:', gkError)
    }

    return {
      id: brief.id,
      referenceNumber: brief.reference_number,
      status: brief.status
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create portal brief:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to submit brief' })
  }
})
