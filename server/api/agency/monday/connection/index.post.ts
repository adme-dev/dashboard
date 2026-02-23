/**
 * Save Monday.com API token and test connection
 * POST /api/agency/monday/connection
 */

import { createError, getRequestHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { createMondayClient, validateMondayToken } from '~~/server/utils/mondayClient'
import { query } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { token } = body

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'API token is required'
    })
  }

  // Validate the token
  const validation = await validateMondayToken(token)
  
  if (!validation.valid) {
    throw createError({
      statusCode: 401,
      statusMessage: `Invalid API token: ${validation.error}`
    })
  }

  try {
    // Store the token (upsert)
    await query(`
      INSERT INTO integration_configs (
        integration_type, 
        access_token, 
        account_id, 
        account_name,
        connected_by,
        connected_at,
        settings
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      ON CONFLICT (integration_type) 
      DO UPDATE SET 
        access_token = EXCLUDED.access_token,
        account_id = EXCLUDED.account_id,
        account_name = EXCLUDED.account_name,
        connected_by = EXCLUDED.connected_by,
        connected_at = EXCLUDED.connected_at,
        settings = EXCLUDED.settings
    `, [
      'monday',
      token,
      validation.account!.id,
      validation.account!.name,
      user.id,
      JSON.stringify({
        frequency: 'hourly',
        direction: 'oneway',
        syncComments: true,
        syncFiles: true,
        syncSubitems: true,
        deleteArchived: false
      })
    ])

    return {
      success: true,
      account: validation.account
    }
  } catch (error: any) {
    console.error('Failed to save Monday.com token:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to save connection'
    })
  }
})
