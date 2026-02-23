/**
 * Update Monday.com sync settings
 * PUT /api/agency/monday/settings
 */

import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { query } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  try {
    await query(`
      UPDATE integration_configs 
      SET settings = $1,
          updated_at = NOW()
      WHERE integration_type = 'monday'
    `, [JSON.stringify(body)])

    return { success: true }
  } catch (error: any) {
    console.error('Failed to update settings:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update settings'
    })
  }
})
