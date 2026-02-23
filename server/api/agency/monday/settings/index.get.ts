/**
 * Get Monday.com sync settings
 * GET /api/agency/monday/settings
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = await queryOne(`
    SELECT settings FROM integration_configs 
    WHERE integration_type = 'monday' 
    LIMIT 1
  `)

  const defaultSettings = {
    frequency: 'hourly',
    direction: 'oneway',
    syncComments: true,
    syncFiles: true,
    syncSubitems: true,
    deleteArchived: false
  }

  return {
    settings: config?.settings || defaultSettings
  }
})
