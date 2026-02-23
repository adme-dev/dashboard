/**
 * Start a new migration session
 * POST /api/agency/monday/migrations
 */

import { createError, readBody } from 'h3'
import { createMondayClient } from '../../../../utils/mondayClient'
import { createMigrationSession, MondayMigrationService, type MigrationConfig } from '../../../../utils/mondayMigration'
import { requireAuth } from '../../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  // Validate request
  const { config } = body as { config: MigrationConfig }

  if (!config) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Migration config is required',
    })
  }

  try {
    // Test connection first
    const client = await createMondayClient()
    const account = await client.testConnection()

    // Create migration session
    const sessionId = await createMigrationSession(
      user.id,
      account.id,
      account.name,
      config
    )

    // Start migration in background (don't await)
    const migrationService = new MondayMigrationService(client, sessionId, config)
    migrationService.migrate().catch(error => {
      console.error('Migration failed:', error)
    })

    return {
      success: true,
      sessionId,
      status: 'running',
      message: 'Migration started successfully',
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to start migration: ${error.message}`,
    })
  }
})
