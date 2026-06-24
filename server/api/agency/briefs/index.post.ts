/**
 * Create a new brief submission
 */

import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { getAuthUser } from '~~/server/utils/auth'
import { notifyBriefSubmitted, notifyBriefAssigned } from '~~/server/utils/briefNotifications'
import { runBriefGatekeeper } from '~~/server/utils/automation/briefGatekeeperRunner'
import { normalizeBriefPriority } from '~~/server/utils/briefPriority'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    templateId,
    title,
    clientId,
    projectId,
    departmentId,
    priority,
    requestedDeadline,
    budgetMin,
    budgetMax,
    budgetCurrency,
    fieldValues, // { [fieldKey]: value }
    isDraft = false,
    source = 'internal',
    // For guest submissions
    submitterName,
    submitterEmail
  } = body

  if (!templateId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template ID is required'
    })
  }

  if (!title?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  try {
    // Verify template exists and is active
    const template = await queryOne(`
      SELECT
        bt.id,
        bt.name,
        bt.default_priority,
        bt.requires_approval,
        bt.auto_assign_to,
        bt.auto_assign_department,
        bt.require_client_link
      FROM brief_templates bt
      WHERE bt.id = $1 AND bt.is_active = true
    `, [templateId])

    if (!template) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Template not found or inactive'
      })
    }

    // Check if client link is required
    if (template.require_client_link && !clientId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'This template requires a client to be selected'
      })
    }

    // Get submitter info (try session user first)
    let submittedBy = null
    try {
      const user = await getAuthUser(event)
      submittedBy = user?.id || null
    } catch {
      // No session - guest submission
    }

    // Validate required fields if not a draft
    if (!isDraft && fieldValues) {
      const fields = await queryRows(`
        SELECT field_key, field_label, is_required
        FROM brief_template_fields
        WHERE template_id = $1 AND is_required = true
      `, [templateId])

      const missingFields = fields.filter(f => {
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

    // Determine department
    const actualDepartmentId = departmentId || template.auto_assign_department || null
    const assignedTo = template.auto_assign_to || null

    // Create brief
    const brief = await queryOne(`
      INSERT INTO briefs (
        template_id,
        title,
        submitted_by,
        submitted_by_name,
        submitted_by_email,
        client_id,
        project_id,
        department_id,
        status,
        priority,
        assigned_to,
        assigned_at,
        requested_deadline,
        budget_min,
        budget_max,
        budget_currency,
        source,
        submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      templateId,
      title.trim(),
      submittedBy,
      submittedBy ? null : (submitterName || null),
      submittedBy ? null : (submitterEmail || null),
      clientId || null,
      projectId || null,
      actualDepartmentId,
      isDraft ? 'draft' : 'submitted',
      normalizeBriefPriority(priority, template.default_priority),
      assignedTo,
      assignedTo ? new Date().toISOString() : null,
      requestedDeadline || null,
      budgetMin || null,
      budgetMax || null,
      budgetCurrency || 'USD',
      source,
      isDraft ? null : new Date().toISOString()
    ])

    // Save field values
    if (fieldValues && Object.keys(fieldValues).length > 0) {
      // Get field IDs
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
      INSERT INTO brief_activities (brief_id, user_id, activity_type, content)
      VALUES ($1, $2, $3, $4)
    `, [
      brief.id,
      submittedBy,
      isDraft ? 'created' : 'submitted',
      isDraft ? 'Brief draft created' : 'Brief submitted'
    ])

    // Add submitter as watcher
    if (submittedBy) {
      await execute(`
        INSERT INTO brief_watchers (brief_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (brief_id, user_id) DO NOTHING
      `, [brief.id, submittedBy])
    }

    // Add assignee as watcher
    if (assignedTo) {
      await execute(`
        INSERT INTO brief_watchers (brief_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (brief_id, user_id) DO NOTHING
      `, [brief.id, assignedTo])

      // Log assignment activity
      await execute(`
        INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
        VALUES ($1, $2, 'assigned', $3, 'Auto-assigned based on template settings')
      `, [brief.id, submittedBy, JSON.stringify({ assigneeId: assignedTo })])
    }

    // Notify on submission (fire-and-forget)
    if (!isDraft && submittedBy) {
      const templateName = template.name || 'Brief'
      notifyBriefSubmitted({
        briefId: brief.id,
        briefTitle: title.trim(),
        referenceNumber: brief.reference_number,
        submitterId: submittedBy,
        templateName
      }).catch(err => console.error('[Brief] Submit notification error:', err))
    }

    // Notify assignee (fire-and-forget)
    if (assignedTo && submittedBy) {
      notifyBriefAssigned({
        briefId: brief.id,
        briefTitle: title.trim(),
        referenceNumber: brief.reference_number,
        assigneeId: assignedTo,
        assignerId: submittedBy
      }).catch(err => console.error('[Brief] Assign notification error:', err))
    }

    // C5 brief-completeness gatekeeper on create-as-submitted (DORMANT — only acts
    // when BRIEF_GATEKEEPER_ENABLED). Field values are already inserted above, so the
    // completeness score is accurate. Fail-open: never block brief creation.
    if (!isDraft) {
      try {
        await runBriefGatekeeper(brief.id)
      } catch (gkError) {
        console.error('[Brief] Gatekeeper failed:', gkError)
      }
    }

    return {
      id: brief.id,
      referenceNumber: brief.reference_number,
      status: brief.status,
      message: isDraft ? 'Draft saved successfully' : 'Brief submitted successfully'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create brief:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create brief'
    })
  }
})
