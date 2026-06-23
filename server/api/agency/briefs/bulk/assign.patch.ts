/**
 * Bulk assign briefs to a team member
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { notifyBriefAssigned } from '~~/server/utils/briefNotifications'
import { maybeAcknowledgeBrief } from '~~/server/utils/automation/actionedConfirmationRunner'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  const { briefIds, assigneeId } = body

  if (!Array.isArray(briefIds) || briefIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'briefIds must be a non-empty array' })
  }

  if (!assigneeId) {
    throw createError({ statusCode: 400, statusMessage: 'assigneeId is required' })
  }

  if (briefIds.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot assign more than 100 briefs at once' })
  }

  try {
    // Validate assignee exists
    const assignee = await queryOne(
      'SELECT id, name FROM team_members WHERE id = $1 AND is_active = true',
      [assigneeId]
    )

    if (!assignee) {
      throw createError({ statusCode: 404, statusMessage: 'Assignee not found or inactive' })
    }

    // Validate all briefs exist
    const placeholders = briefIds.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const existingBriefs = await queryRows(
      `SELECT id, title, reference_number FROM briefs WHERE id IN (${placeholders})`,
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

    // Assign in transaction
    await transaction(async (client) => {
      for (const brief of existingBriefs) {
        // Update assignment
        await client.query(
          `UPDATE briefs SET assigned_to = $1, assigned_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [assigneeId, brief.id]
        )

        // Add assignee as watcher
        await client.query(
          `INSERT INTO brief_watchers (brief_id, user_id) VALUES ($1, $2) ON CONFLICT (brief_id, user_id) DO NOTHING`,
          [brief.id, assigneeId]
        )

        // Log activity
        await client.query(
          `INSERT INTO brief_activities (brief_id, user_id, activity_type, new_value, content)
           VALUES ($1, $2, 'assigned', $3, $4)`,
          [
            brief.id,
            user.id,
            JSON.stringify({ assigneeId, assigneeName: assignee.name }),
            `Bulk assigned to ${assignee.name}`
          ]
        )
      }
    })

    // Fire notifications (fire-and-forget)
    for (const brief of existingBriefs) {
      notifyBriefAssigned({
        briefId: brief.id,
        briefTitle: brief.title,
        referenceNumber: brief.reference_number,
        assigneeId,
        assignerId: user.id
      }).catch(err => console.error('[Brief] Bulk assign notification error:', err))
    }

    // C7: ack each newly-assigned brief (flag-gated, fail-open, deduped per brief).
    for (const briefId of existingBriefs.map(b => b.id)) await maybeAcknowledgeBrief(briefId)

    return {
      assigned: existingBriefs.length,
      assigneeName: assignee.name,
      message: `${existingBriefs.length} briefs assigned to ${assignee.name}`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to bulk assign briefs:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to bulk assign briefs' })
  }
})
