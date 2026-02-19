/**
 * Delete Automation Rule
 * DELETE /api/agency/automation/rules/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ruleId = getRouterParam(event, 'id')

  if (!ruleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rule ID is required'
    })
  }

  try {
    const rule = await queryOne(`
      DELETE FROM automation_rules
      WHERE id = $1
      RETURNING id, name, trigger_type
    `, [ruleId])

    if (!rule) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Automation rule not found'
      })
    }

    return {
      success: true,
      deleted: {
        id: rule.id,
        name: rule.name,
        triggerType: rule.trigger_type
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete automation rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete automation rule'
    })
  }
})
