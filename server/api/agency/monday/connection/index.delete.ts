/**
 * Disconnect Monday.com integration
 * DELETE /api/agency/monday/connection
 */

import { requireAuth } from '~~/server/utils/auth'
import { query } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    await query(`
      DELETE FROM integration_configs 
      WHERE integration_type = 'monday'
    `)

    return { success: true }
  } catch (error: any) {
    console.error('Failed to disconnect Monday.com:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to disconnect'
    })
  }
})
