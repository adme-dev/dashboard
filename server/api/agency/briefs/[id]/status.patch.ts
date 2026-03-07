/**
 * Update brief status
 */

import { queryOne, execute } from '~~/server/utils/db'
import { getAuthUser } from '~~/server/utils/auth'
import { notifyBriefStatusChanged } from '~~/server/utils/briefNotifications'
import { convertBriefToProject } from '~~/server/utils/briefConversion'
import { generateQuoteFromBrief } from '~~/server/utils/briefQuoteGenerator'

const VALID_STATUSES = [
  'draft', 'submitted', 'under_review', 'needs_info',
  'approved', 'rejected', 'in_progress', 'completed', 'cancelled'
]

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  const { status, notes } = body

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief ID is required'
    })
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
    })
  }

  try {
    // Get current brief
    const brief = await queryOne('SELECT id, status FROM briefs WHERE id = $1', [id])

    if (!brief) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Brief not found'
      })
    }

    const oldStatus = brief.status

    // Get current user
    let userId = null
    try {
      const user = await getAuthUser(event)
      userId = user?.id || null
    } catch {}

    // Build update query
    const updates: string[] = ['status = $2', 'updated_at = NOW()']
    const params: any[] = [id, status]
    let paramIdx = 3

    // Set timestamps based on status
    if (status === 'submitted' && oldStatus === 'draft') {
      updates.push('submitted_at = NOW()')
    }

    if (['approved', 'rejected'].includes(status)) {
      updates.push(`reviewed_by = $${paramIdx}`)
      params.push(userId)
      paramIdx++
      updates.push('reviewed_at = NOW()')
      if (notes) {
        updates.push(`review_notes = $${paramIdx}`)
        params.push(notes)
        paramIdx++
      }
    }

    if (status === 'completed') {
      updates.push('completed_at = NOW()')
    }

    // Update brief
    await execute(`
      UPDATE briefs
      SET ${updates.join(', ')}
      WHERE id = $1
    `, params)

    // Log activity
    const activityType = status === 'approved' ? 'approved' :
                         status === 'rejected' ? 'rejected' :
                         status === 'needs_info' ? 'needs_info' :
                         status === 'completed' ? 'completed' :
                         status === 'cancelled' ? 'cancelled' :
                         'status_changed'

    await execute(`
      INSERT INTO brief_activities (brief_id, user_id, activity_type, old_value, new_value, content)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      id,
      userId,
      activityType,
      JSON.stringify({ status: oldStatus }),
      JSON.stringify({ status }),
      notes || `Status changed from ${oldStatus} to ${status}`
    ])

    // Notify watchers (fire-and-forget)
    const briefForNotif = await queryOne('SELECT title, reference_number FROM briefs WHERE id = $1', [id])
    if (briefForNotif && userId) {
      notifyBriefStatusChanged({
        briefId: id,
        briefTitle: briefForNotif.title,
        referenceNumber: briefForNotif.reference_number,
        oldStatus,
        newStatus: status,
        actorId: userId
      }).catch(err => console.error('[Brief] Notification error:', err))
    }

    // Auto-convert to project on approval
    let autoConvertResult = null
    if (status === 'approved' && userId) {
      try {
        const templateInfo = await queryOne(`
          SELECT bt.project_template_id, bt.auto_convert_on_approval, bt.field_mapping
          FROM brief_templates bt
          WHERE bt.id = (SELECT template_id FROM briefs WHERE id = $1)
        `, [id])

        if (templateInfo?.auto_convert_on_approval && templateInfo.project_template_id) {
          const briefData = await queryOne('SELECT title, client_id FROM briefs WHERE id = $1', [id])
          if (briefData) {
            autoConvertResult = await convertBriefToProject({
              briefId: id,
              userId,
              projectTemplateId: templateInfo.project_template_id,
              projectName: briefData.title || 'Untitled Project'
            })
          }
        }
      } catch (convertError) {
        console.error('[Brief] Auto-convert failed:', convertError)
        // Don't throw — status change already succeeded
      }
    }

    // Auto-generate quote on approval if template requires it
    let autoQuoteResult = null
    if (status === 'approved' && userId) {
      try {
        const tplInfo = await queryOne(`
          SELECT requires_quote
          FROM brief_templates
          WHERE id = (SELECT template_id FROM briefs WHERE id = $1)
        `, [id])

        if (tplInfo?.requires_quote) {
          const briefCheck = await queryOne('SELECT quote_id FROM briefs WHERE id = $1', [id])
          if (!briefCheck?.quote_id) {
            autoQuoteResult = await generateQuoteFromBrief(id, userId)
          }
        }
      } catch (quoteError) {
        console.error('[Brief] Auto-quote generation failed:', quoteError)
        // Don't throw — status change already succeeded
      }
    }

    return {
      id,
      status,
      message: `Brief status updated to ${status}`,
      autoConvert: autoConvertResult ? {
        projectId: autoConvertResult.project.id,
        projectName: autoConvertResult.project.name,
        tasksCreated: autoConvertResult.tasksCreated
      } : null,
      autoQuote: autoQuoteResult ? {
        quoteId: autoQuoteResult.quoteId,
        quoteNumber: autoQuoteResult.quoteNumber,
        total: autoQuoteResult.total,
        lineItemCount: autoQuoteResult.lineItemCount,
        tasksLinked: autoQuoteResult.tasksLinked
      } : null
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update brief status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update brief status'
    })
  }
})
