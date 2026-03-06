/**
 * Bulk update brief statuses
 */

import { queryRows, transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { notifyBriefStatusChanged } from '~~/server/utils/briefNotifications'

const VALID_STATUSES = [
  'draft', 'submitted', 'under_review', 'needs_info',
  'approved', 'rejected', 'in_progress', 'completed', 'cancelled'
]

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  const { briefIds, status, notes } = body

  if (!Array.isArray(briefIds) || briefIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'briefIds must be a non-empty array' })
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
    })
  }

  if (briefIds.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot update more than 100 briefs at once' })
  }

  try {
    // Validate all briefs exist
    const placeholders = briefIds.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const existingBriefs = await queryRows(
      `SELECT id, title, reference_number, status FROM briefs WHERE id IN (${placeholders})`,
      briefIds
    )

    if (existingBriefs.length !== briefIds.length) {
      const found = new Set(existingBriefs.map(b => b.id))
      const missing = briefIds.filter((id: string) => !found.has(id))
      throw createError({
        statusCode: 404,
        statusMessage: `Briefs not found: ${missing.join(', ')}`
      })
    }

    // Update in a transaction
    await transaction(async (client) => {
      for (const brief of existingBriefs) {
        const oldStatus = brief.status

        // Build update
        const updates = ['status = $2', 'updated_at = NOW()']
        const params: any[] = [brief.id, status]
        let paramIdx = 3

        if (status === 'completed') {
          updates.push('completed_at = NOW()')
        }
        if (['approved', 'rejected'].includes(status)) {
          updates.push(`reviewed_by = $${paramIdx}`)
          params.push(user.id)
          paramIdx++
          updates.push('reviewed_at = NOW()')
        }

        await client.query(
          `UPDATE briefs SET ${updates.join(', ')} WHERE id = $1`,
          params
        )

        // Log activity
        await client.query(
          `INSERT INTO brief_activities (brief_id, user_id, activity_type, old_value, new_value, content)
           VALUES ($1, $2, 'status_changed', $3, $4, $5)`,
          [
            brief.id,
            user.id,
            JSON.stringify({ status: oldStatus }),
            JSON.stringify({ status }),
            notes || `Bulk status change from ${oldStatus} to ${status}`
          ]
        )
      }
    })

    // Fire notifications per brief (fire-and-forget)
    for (const brief of existingBriefs) {
      notifyBriefStatusChanged({
        briefId: brief.id,
        briefTitle: brief.title,
        referenceNumber: brief.reference_number,
        oldStatus: brief.status,
        newStatus: status,
        actorId: user.id
      }).catch(err => console.error('[Brief] Bulk notification error:', err))
    }

    return {
      updated: existingBriefs.length,
      status,
      message: `${existingBriefs.length} briefs updated to ${status}`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to bulk update brief status:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to bulk update brief status' })
  }
})
