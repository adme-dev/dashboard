import type { H3Event } from 'h3'
import { createError } from 'h3'
import { execute, queryOne } from '~~/server/utils/db'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'
import { createMigrationSession, MondayMigrationService, type MigrationConfig } from '~~/server/utils/mondayMigration'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { reconcileMondaySyncSession } from '~~/server/utils/hr/mondaySyncReconcile'
import type { ActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { refreshMondayEvidenceExtracts } from '~~/server/utils/hr/mondayEvidenceExtract'

export async function startGovernedMondaySync(
  event: H3Event,
  scope: ActiveMondayEvidenceScope,
  actorId: string,
  trigger: 'manual' | 'scheduled',
) {
  const running = await queryOne<{ lastStartedAt: string }>(
    `SELECT last_started_at AS "lastStartedAt"
       FROM hr_monday_sync_states
      WHERE scope_id = $1 AND status = 'running'
        AND last_started_at > NOW() - INTERVAL '30 minutes'
      ORDER BY last_started_at DESC LIMIT 1`,
    [scope.id],
  )
  if (running) {
    return { ok: true, scopeId: scope.id, boardCount: scope.board_ids.length, status: 'already_running' as const }
  }

  const connection = await resolveMondayConnection()
  if (!connection) throw createError({ statusCode: 409, statusMessage: 'Monday is not connected' })

  const prior = await queryOne<{ boardCount: number; completedCount: number; earliestCompletedAt: string | null }>(
    `SELECT COUNT(*)::int AS "boardCount",
            COUNT(last_completed_at)::int AS "completedCount",
            MIN(last_completed_at) AS "earliestCompletedAt"
       FROM hr_monday_sync_states WHERE scope_id = $1 AND monday_board_id = ANY($2::text[])`,
    [scope.id, scope.board_ids],
  )
  const completeCheckpoint = prior?.boardCount === scope.board_ids.length && prior.completedCount === scope.board_ids.length
    ? prior.earliestCompletedAt
    : null
  const config: MigrationConfig = {
    skipArchivedBoards: true,
    skipCompletedItems: false,
    importUpdates: scope.allowed_fields.includes('updates'),
    importFiles: scope.allowed_fields.includes('files'),
    importSubitems: true,
    allowedFields: scope.allowed_fields,
    updatedSince: completeCheckpoint || `${scope.period_start}T00:00:00.000Z`,
    updatedUntil: `${scope.period_end}T23:59:59.999Z`,
    boardMappings: scope.destination_mappings.map(mapping => ({
      mondayBoardId: mapping.boardId,
      departmentId: mapping.departmentId,
      projectId: mapping.projectId,
    })),
  }

  const sessionId = await createMigrationSession(actorId, connection.accountId || 'monday', connection.accountName || 'Monday', config)
  await execute(
    `INSERT INTO hr_monday_sync_states (scope_id, monday_board_id, status, last_started_at, updated_at)
     SELECT $1, board_id, 'running', NOW(), NOW() FROM UNNEST($2::text[]) AS board_id
     ON CONFLICT (scope_id, monday_board_id) DO UPDATE SET status = 'running', last_started_at = NOW(), error_message = NULL, updated_at = NOW()`,
    [scope.id, scope.board_ids],
  )

  const client = await createMondayClient(connection.accessToken)
  const work = new MondayMigrationService(client, sessionId, config).migrate()
    .then(async () => {
      const reconciliation = await reconcileMondaySyncSession(scope.id, scope.board_ids, sessionId)
      await refreshMondayEvidenceExtracts(scope)
      return reconciliation
    })
    .catch(async (error) => {
      console.error('HR Monday sync failed', { sessionId, trigger, error })
      await execute(
        `UPDATE hr_monday_sync_states SET status = 'failed', error_message = $1, updated_at = NOW() WHERE scope_id = $2`,
        [String((error as any)?.message || error).slice(0, 2000), scope.id],
      ).catch(() => undefined)
      await reconcileMondaySyncSession(scope.id, scope.board_ids, sessionId).catch(() => undefined)
      await refreshMondayEvidenceExtracts(scope).catch(() => undefined)
    })
  runAfterResponse(event, work, `HR Monday ${trigger} sync ${sessionId}`)

  await recordHrAuditEvent({
    actorId,
    action: 'monday_evidence.sync.started',
    targetType: 'monday_migration_session',
    targetId: sessionId,
    metadata: { scopeId: scope.id, boardCount: scope.board_ids.length, trigger },
  })
  return { ok: true, sessionId, scopeId: scope.id, boardCount: scope.board_ids.length, status: 'running' as const }
}
