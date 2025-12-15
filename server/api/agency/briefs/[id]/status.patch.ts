/**
 * Update brief status
 */

import { queryOne, execute } from '~~/server/utils/db'

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
      const session = await getUserSession(event)
      userId = session?.user?.id || null
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

    return {
      id,
      status,
      message: `Brief status updated to ${status}`
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
