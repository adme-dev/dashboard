/**
 * Run Monday.com sync
 * POST /api/agency/monday/sync
 */

import { createError } from 'h3'
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { queryOne, query } from '~~/server/utils/db'
import { syncMondayBoardToDepartment } from '~~/server/utils/mondaySync'

const BoardIdSchema = z.string().trim().regex(/^\d+$/, 'Board IDs must be numeric').max(30)
const OperationalSyncSchema = z.object({
  boardIds: z.array(BoardIdSchema).min(1).max(25),
  mappings: z.record(BoardIdSchema, z.object({
    departmentId: z.string().uuid()
  }).strict())
}).strict()

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const parsed = OperationalSyncSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday sync request'
    })
  }
  const { boardIds, mappings } = parsed.data

  if (boardIds.some(boardId => !mappings[boardId])) {
    throw createError({ statusCode: 400, statusMessage: 'Every board requires a department mapping' })
  }

  const requestedDepartmentIds = [...new Set(boardIds.map(id => mappings[id]!.departmentId))]
  const validDepartments = await query<{ id: string }>(
    'SELECT id FROM departments WHERE id = ANY($1::uuid[])',
    [requestedDepartmentIds]
  )
  if (validDepartments.length !== requestedDepartmentIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'One or more department mappings are invalid' })
  }

  // Get the stored token
  const config = await queryOne(`
    SELECT access_token FROM integration_configs 
    WHERE integration_type = 'monday' 
    LIMIT 1
  `)

  if (!config?.access_token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not connected to Monday.com'
    })
  }

  const client = await createMondayClient(config.access_token)
  const results = {
    boardsSynced: 0,
    itemsSynced: 0,
    itemsFailed: 0,
    errors: [] as string[]
  }

  // Create sync log entry
  const syncLog = await query<{ id: string }>(`
    INSERT INTO sync_logs (
      integration_type,
      operation,
      status,
      started_by,
      started_at
    ) VALUES ($1, $2, $3, $4, NOW())
    RETURNING id
  `, ['monday', 'full_sync', 'pending', user.id])

  const syncLogId = syncLog[0]?.id

  try {
    for (const boardId of boardIds) {
      const mapping = mappings[boardId]
      if (!mapping?.departmentId) {
        results.errors.push(`Board ${boardId}: No department mapping`)
        continue
      }

      try {
        const boardResult = await syncMondayBoardToDepartment(
          client,
          boardId,
          mapping.departmentId,
          {
            syncComments: true,
            syncFiles: true,
            syncSubitems: true
          }
        )

        results.boardsSynced++
        results.itemsSynced += boardResult.itemsSynced
        results.itemsFailed += boardResult.itemsFailed
      } catch (error: any) {
        console.error(`[monday-sync] Board ${boardId} failed`, error)
        results.errors.push(`Board ${boardId}: Sync failed`)
      }
    }

    // Update sync log
    await query(`
      UPDATE sync_logs 
      SET status = $1,
          completed_at = NOW(),
          details = $2
      WHERE id = $3
    `, [
      results.errors.length > 0 ? 'partial' : 'success',
      JSON.stringify(results),
      syncLogId
    ])

    return {
      success: results.errors.length === 0,
      ...results
    }
  } catch (error: any) {
    // Update sync log with error
    await query(`
      UPDATE sync_logs 
      SET status = 'error',
          completed_at = NOW(),
          details = $1
      WHERE id = $2
    `, [JSON.stringify({ error: error.message }), syncLogId])

    throw createError({
      statusCode: 500,
      statusMessage: 'Monday sync failed'
    })
  }
})
