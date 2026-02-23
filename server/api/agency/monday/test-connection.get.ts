/**
 * Test Monday.com API connection
 * GET /api/agency/monday/test-connection
 */

import { createError } from 'h3'
import { createMondayClient } from '../../../utils/mondayClient'
import { requireAuth } from '../../../utils/auth'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    const client = await createMondayClient()
    const account = await client.testConnection()

    return {
      success: true,
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
      },
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to connect to Monday.com: ${error.message}`,
    })
  }
})
