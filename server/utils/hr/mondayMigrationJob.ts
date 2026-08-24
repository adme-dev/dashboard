import type { H3Event } from 'h3'
import { execute, queryOne } from '~~/server/utils/db'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'
import { MondayMigrationService, type MigrationConfig } from '~~/server/utils/mondayMigration'
import { reconcileMondaySyncSession } from '~~/server/utils/hr/mondaySyncReconcile'
import type { ActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { refreshMondayEvidenceExtracts } from '~~/server/utils/hr/mondayEvidenceExtract'

export interface HrMondayMigrationPayload {
  sessionId: string
  scopeId: string
  trigger: string
  config: MigrationConfig
}

/**
 * Run an already-created Monday migration session to completion. Extracted
 * from mondaySyncRunner.ts / the import endpoint so this — the whole
 * migration, not just a notification — can be dispatched as a durable queue
 * job (workers/jobs-consumer) instead of a runAfterResponse waitUntil
 * deferral. A dropped waitUntil here would leave the session stuck
 * 'running' forever with sensitive HR data half-imported.
 */
export async function runHrMondayMigration(event: H3Event, payload: HrMondayMigrationPayload): Promise<void> {
  const { sessionId, scopeId, trigger, config } = payload

  const scope = await queryOne<ActiveMondayEvidenceScope>(
    `SELECT id, workspace_ids, board_ids, destination_mappings, allowed_fields, purpose, exclusions,
            period_start, period_end, retention_days, approved_by
       FROM hr_monday_evidence_scopes
      WHERE id = $1`,
    [scopeId],
  )
  if (!scope) {
    console.error('HR Monday migration job: scope no longer exists', { sessionId, scopeId })
    return
  }

  const connection = await resolveMondayConnection()
  if (!connection) {
    console.error('HR Monday migration job: Monday is not connected', { sessionId, scopeId })
    await execute(
      `UPDATE hr_monday_sync_states SET status = 'failed', error_message = $1, updated_at = NOW() WHERE scope_id = $2`,
      ['Monday is not connected', scopeId],
    ).catch(() => undefined)
    return
  }

  const client = await createMondayClient(connection.accessToken)
  await new MondayMigrationService(client, sessionId, config).migrate()
    .then(async () => {
      await reconcileMondaySyncSession(scope.id, scope.board_ids, sessionId)
      await refreshMondayEvidenceExtracts(scope)
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
}
