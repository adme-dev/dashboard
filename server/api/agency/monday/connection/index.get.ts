/**
 * Get Monday.com connection status
 * GET /api/agency/monday/connection
 */

import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    // Check if we have a stored token
    const config = await queryOne(`
      SELECT * FROM integration_configs 
      WHERE integration_type = 'monday' 
      LIMIT 1
    `)

    if (!config?.access_token) {
      return { connected: false }
    }

    // Test the connection
    const client = await createMondayClient(config.access_token)
    const account = await client.testConnection()

    return {
      connected: true,
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
      },
      settings: config.settings || {}
    }
  } catch (error: any) {
    // Token exists but is invalid
    return { connected: false, error: 'Invalid token' }
  }
})
