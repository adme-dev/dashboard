import { createError, readBody, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'
import { createMigrationSession, MondayMigrationService, type MigrationConfig } from '~~/server/utils/mondayMigration'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { enqueue } from '~~/server/utils/queue'

/** Start a governed, board-scoped Monday sync for HR evidence preparation. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'An approved Monday evidence scope is required before import' })

  const connection = await resolveMondayConnection()
  if (!connection) throw createError({ statusCode: 409, statusMessage: 'Monday is not connected' })

  const body = await readBody<{ importSubitems?: boolean }>(event)
  const config: MigrationConfig = {
    skipArchivedBoards: true,
    skipCompletedItems: false,
    importUpdates: scope.allowed_fields.includes('updates'),
    importFiles: scope.allowed_fields.includes('files'),
    importSubitems: body?.importSubitems ?? true,
    allowedFields: scope.allowed_fields,
    updatedSince: `${scope.period_start}T00:00:00.000Z`,
    updatedUntil: `${scope.period_end}T23:59:59.999Z`,
    boardMappings: scope.destination_mappings.map(mapping => ({ mondayBoardId: mapping.boardId, departmentId: mapping.departmentId, projectId: mapping.projectId })),
  }
  const client = await createMondayClient(connection.accessToken)
  const sessionId = await createMigrationSession(user.id, connection.accountId || 'monday', connection.accountName || 'Monday', config)
  const service = new MondayMigrationService(client, sessionId, config)
  // Dispatched via the durable job queue (retried by workers/jobs-consumer)
  // so a stuck-'running' migration survives a dropped Pages waitUntil; local
  // dev without a queue binding falls back to today's fire-and-forget behavior.
  await enqueue(
    event,
    'hr.monday.migrate',
    { sessionId, scopeId: scope.id, trigger: 'manual-import', config },
    () => runAfterResponse(event, service.migrate(), `HR Monday import ${sessionId}`) as unknown as Promise<void>
  )
  await recordHrAuditEvent({ actorId: user.id, action: 'monday_evidence.import.started', targetType: 'monday_migration_session', targetId: sessionId, metadata: { scopeId: scope.id, boardCount: scope.board_ids.length, importUpdates: config.importUpdates, importFiles: config.importFiles } })
  return { ok: true, sessionId, scopeId: scope.id, status: 'running', boardCount: scope.board_ids.length }
})
