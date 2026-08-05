import { queryOneFresh, queryRows, transaction } from '~~/server/utils/db'
import {
  appendGodModeAuditEvent,
  type GodModeAuditEventInput,
  type GodModeChannel
} from './audit'
import type { ExecutorClass } from '~~/server/utils/ai/executors/types'
import { getAsset } from '~~/server/utils/audio/assets'

export interface ReconciliationCandidate {
  actorUserId: string
  channel: GodModeChannel
  correlationId: string
  idempotencyKey: string
  state: 'in_progress' | 'ambiguous'
  routeOrTool: string
  executorClass: ExecutorClass
  sessionDigest: string
  tenantId: string | null
  clientId: string | null
  resultReference: string | null
  executionPhase?: string
  executionMetadata?: Record<string, unknown> | null
}

export interface ReconciledProviderOutcome {
  state: 'succeeded' | 'failed' | 'unknown'
  resultReference?: string | null
}

export interface GodModeProviderLookupDependencies {
  getAudioAsset: (id: string) => Promise<{ id: string, status: string } | null>
}

const providerLookupDependencies: GodModeProviderLookupDependencies = {
  getAudioAsset: async id => await getAsset(id)
}

export interface GodModeReconciliationDependencies {
  listCandidates: (limit: number) => Promise<ReconciliationCandidate[]>
  findAttempt: (correlationId: string) => Promise<GodModeAuditEventInput | null>
  findTerminal: (correlationId: string) => Promise<{ phase: 'succeeded' | 'failed', outcomeCode: string } | null>
  /** Never dispatch/repeat the primary action; only bounded lookup or an idempotent local link repair. */
  lookupOutcome: (candidate: ReconciliationCandidate) => Promise<ReconciledProviderOutcome>
  /** A null terminal means an immutable terminal already exists; close only the coordination row. */
  appendTerminalAndClose: (candidate: ReconciliationCandidate, terminal: GodModeAuditEventInput | null) => Promise<boolean>
  markAlertable: (candidate: ReconciliationCandidate, reason:
    | 'provider_outcome_unknown'
    | 'provider_lookup_failed'
    | 'attempt_identity_missing'
    | 'attempt_identity_mismatch'
  ) => Promise<void>
}

export interface SocialCaseLinkRepairDependencies {
  findTask: (taskId: string) => Promise<{ id: string } | null>
  findConversation: (conversationId: string, clientId: string) => Promise<{ id: string, linkedTaskId: string | null } | null>
  linkExistingTask: (input: {
    taskId: string
    socialConversationId: string
    clientId: string
    actorUserId: string
  }) => Promise<boolean>
}

const defaultSocialRepairDependencies: SocialCaseLinkRepairDependencies = {
  findTask: async taskId => await queryOneFresh('SELECT id FROM tasks WHERE id = $1 LIMIT 1', [taskId]),
  findConversation: async (conversationId, clientId) => await queryOneFresh(
    `SELECT id, linked_task_id AS "linkedTaskId"
       FROM social_conversations WHERE id = $1 AND client_id = $2 LIMIT 1`,
    [conversationId, clientId]
  ),
  linkExistingTask: async input => await transaction(async db => {
    const updated = await db.query(
      `UPDATE social_conversations
          SET linked_task_id = $3, native_linked_by = $4, native_linked_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND client_id = $2 AND linked_task_id IS NULL`,
      [input.socialConversationId, input.clientId, input.taskId, input.actorUserId]
    )
    if ((updated.rowCount ?? 0) === 0) {
      const existing = (await db.query<{ linked_task_id: string | null }>(
        'SELECT linked_task_id FROM social_conversations WHERE id = $1 AND client_id = $2',
        [input.socialConversationId, input.clientId]
      )).rows[0]
      return existing?.linked_task_id === input.taskId
    }
    await db.query(
      `INSERT INTO social_conversation_events
        (conversation_id, client_id, actor_id, event_type, content, metadata)
       VALUES ($1, $2, $3, 'native_link_update', 'Linked task', $4::jsonb)`,
      [
        input.socialConversationId,
        input.clientId,
        input.actorUserId,
        JSON.stringify({ linked_task_id: input.taskId, reconciliation: true })
      ]
    )
    return true
  })
}

export async function repairSocialCaseTaskLink(
  metadata: Record<string, unknown>,
  actorUserId: string,
  dependencies: SocialCaseLinkRepairDependencies = defaultSocialRepairDependencies
): Promise<ReconciledProviderOutcome> {
  const taskId = typeof metadata.taskId === 'string' ? metadata.taskId : ''
  const socialConversationId = typeof metadata.socialConversationId === 'string' ? metadata.socialConversationId : ''
  const clientId = typeof metadata.clientId === 'string' ? metadata.clientId : ''
  if (metadata.compositePhase !== 'task_created' || !taskId || !socialConversationId || !clientId) {
    return { state: 'unknown' }
  }
  const [task, conversation] = await Promise.all([
    dependencies.findTask(taskId),
    dependencies.findConversation(socialConversationId, clientId)
  ])
  if (!task || !conversation) return { state: 'failed' }
  if (conversation.linkedTaskId && conversation.linkedTaskId !== taskId) return { state: 'unknown' }
  if (conversation.linkedTaskId === taskId) return { state: 'succeeded', resultReference: taskId }
  return await dependencies.linkExistingTask({ taskId, socialConversationId, clientId, actorUserId })
    ? { state: 'succeeded', resultReference: taskId }
    : { state: 'unknown' }
}

export async function lookupGodModeExecutionOutcome(
  candidate: ReconciliationCandidate,
  dependencies: GodModeProviderLookupDependencies = providerLookupDependencies
): Promise<ReconciledProviderOutcome> {
  if (candidate.routeOrTool === 'create_social_case_task') {
    return candidate.executionMetadata
      ? await repairSocialCaseTaskLink(candidate.executionMetadata, candidate.actorUserId)
      : { state: 'unknown' }
  }
  if (candidate.state === 'in_progress'
    && ['claimed', 'proposal_prepared'].includes(candidate.executionPhase ?? 'claimed')) {
    return { state: 'failed' }
  }
  if (
    candidate.routeOrTool === 'start_music_generation'
    && candidate.resultReference
  ) {
    const asset = await dependencies.getAudioAsset(candidate.resultReference)
    return asset?.id === candidate.resultReference
      ? { state: 'succeeded', resultReference: candidate.resultReference }
      : { state: 'unknown' }
  }
  // A reference is a bounded captured response only for non-composite internal mutations.
  if (candidate.resultReference) {
    return { state: 'succeeded', resultReference: candidate.resultReference }
  }
  return { state: 'unknown' }
}

const defaultDependencies: GodModeReconciliationDependencies = {
  listCandidates: async limit => {
    const rows = await queryRows<any>(
      `SELECT actor_user_id, channel, correlation_id, idempotency_key, state, route_or_tool,
              executor_class, session_digest, tenant_id, client_id, result_reference,
              execution_phase, execution_metadata
         FROM god_mode_execution_ledger
        WHERE channel IN ('application', 'mcp')
          AND state IN ('in_progress', 'ambiguous')
          AND updated_at < NOW() - INTERVAL '5 minutes'
        ORDER BY updated_at, actor_user_id, idempotency_key
        LIMIT $1`,
      [limit]
    )
    return rows.map(row => ({
      actorUserId: row.actor_user_id,
      channel: row.channel,
      correlationId: row.correlation_id,
      idempotencyKey: row.idempotency_key,
      state: row.state,
      routeOrTool: row.route_or_tool,
      executorClass: row.executor_class,
      sessionDigest: row.session_digest,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      resultReference: row.result_reference,
      executionPhase: row.execution_phase,
      executionMetadata: row.execution_metadata
    }))
  },
  findAttempt: async correlationId => {
    const row = await queryOneFresh<any>(
      `SELECT actor_user_id, correlation_id, session_digest, channel, route_or_tool,
              tenant_id, client_id, entity_type, entity_id, bypassed_controls,
              outcome_code, emergency_disabled
         FROM god_mode_audit_events
        WHERE correlation_id = $1 AND phase = 'attempt'
        LIMIT 1`,
      [correlationId]
    )
    return row
      ? {
          actorUserId: row.actor_user_id,
          correlationId: row.correlation_id,
          sessionDigest: row.session_digest,
          channel: row.channel,
          routeOrTool: row.route_or_tool,
          phase: 'attempt',
          tenantId: row.tenant_id,
          clientId: row.client_id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          bypassedControls: row.bypassed_controls,
          outcomeCode: row.outcome_code,
          emergencyDisabled: row.emergency_disabled
        }
      : null
  },
  findTerminal: async correlationId => await queryOneFresh(
    `SELECT phase, outcome_code AS "outcomeCode"
       FROM god_mode_audit_events
      WHERE correlation_id = $1 AND phase IN ('succeeded', 'failed')
      LIMIT 1`,
    [correlationId]
  ),
  lookupOutcome: lookupGodModeExecutionOutcome,
  appendTerminalAndClose: async (candidate, terminal) => await transaction(async db => {
    if (terminal) await appendGodModeAuditEvent(terminal, db as any)
    const terminalPhase = terminal?.phase ?? (await db.query<{ phase: 'succeeded' | 'failed' }>(
      `SELECT phase FROM god_mode_audit_events
        WHERE correlation_id = $1 AND phase IN ('succeeded', 'failed') LIMIT 1`,
      [candidate.correlationId]
    )).rows[0]?.phase
    if (!terminalPhase) return false
    const updated = await db.query(
      `UPDATE god_mode_execution_ledger
          SET state = $5, updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = $2 AND idempotency_key = $3
          AND correlation_id = $4 AND state IN ('in_progress', 'ambiguous')`,
      [candidate.actorUserId, candidate.channel, candidate.idempotencyKey, candidate.correlationId, terminalPhase]
    )
    await db.query(
      `UPDATE ai_pending_actions
          SET status = CASE WHEN status = 'proposed' THEN 'cancelled' ELSE status END,
              god_mode_state = CASE
                WHEN $3 = 'succeeded' THEN 'completed'
                ELSE 'dismissed'
              END
        WHERE user_id = $1 AND source = 'god_mode_preparation' AND god_mode_execution_key = $2`,
      [candidate.actorUserId, candidate.idempotencyKey, terminalPhase]
    )
    return (updated.rowCount ?? 0) > 0
  }),
  markAlertable: async (candidate, reason) => {
    console.warn('[God mode reconciliation] unresolved execution', {
      correlationId: candidate.correlationId,
      routeOrTool: candidate.routeOrTool,
      state: candidate.state,
      reason
    })
  }
}

function attemptMatchesCandidate(attempt: GodModeAuditEventInput, candidate: ReconciliationCandidate): boolean {
  return attempt.phase === 'attempt'
    && attempt.actorUserId === candidate.actorUserId
    && attempt.correlationId === candidate.correlationId
    && attempt.sessionDigest === candidate.sessionDigest
    && attempt.channel === candidate.channel
    && attempt.routeOrTool === candidate.routeOrTool
}

function terminal(
  attempt: GodModeAuditEventInput,
  outcome: Exclude<ReconciledProviderOutcome['state'], 'unknown'>
): GodModeAuditEventInput {
  return {
    actorUserId: attempt.actorUserId,
    correlationId: attempt.correlationId,
    sessionDigest: attempt.sessionDigest,
    channel: attempt.channel,
    routeOrTool: attempt.routeOrTool,
    phase: outcome,
    tenantId: attempt.tenantId ?? null,
    clientId: attempt.clientId ?? null,
    entityType: attempt.entityType ?? null,
    entityId: attempt.entityId ?? null,
    bypassedControls: [...attempt.bypassedControls],
    outcomeCode: outcome === 'succeeded' ? 'reconciled_succeeded' : 'reconciled_failed',
    emergencyDisabled: attempt.emergencyDisabled
  }
}

export async function reconcileGodModeExecutions(
  dependencies: GodModeReconciliationDependencies = defaultDependencies,
  options: { limit?: number } = {}
): Promise<{ scanned: number, reconciled: number, unknown: number, failed: number }> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 25))
  const candidates = await dependencies.listCandidates(limit)
  const result = { scanned: candidates.length, reconciled: 0, unknown: 0, failed: 0 }

  for (const candidate of candidates) {
    try {
      const attempt = await dependencies.findAttempt(candidate.correlationId)
      if (!attempt) {
        result.failed++
        await dependencies.markAlertable(candidate, 'attempt_identity_missing')
        continue
      }
      if (!attemptMatchesCandidate(attempt, candidate)) {
        result.failed++
        await dependencies.markAlertable(candidate, 'attempt_identity_mismatch')
        continue
      }
      const existing = await dependencies.findTerminal(candidate.correlationId)
      if (existing) {
        if (await dependencies.appendTerminalAndClose(candidate, null)) result.reconciled++
        continue
      }
      let outcome: ReconciledProviderOutcome
      try {
        outcome = await dependencies.lookupOutcome(candidate)
      } catch {
        result.failed++
        await dependencies.markAlertable(candidate, 'provider_lookup_failed')
        continue
      }
      if (outcome.state === 'unknown') {
        result.unknown++
        await dependencies.markAlertable(candidate, 'provider_outcome_unknown')
        continue
      }
      if (await dependencies.appendTerminalAndClose(candidate, terminal(attempt, outcome.state))) {
        result.reconciled++
      }
    } catch {
      result.failed++
      await dependencies.markAlertable(candidate, 'provider_lookup_failed').catch(() => {})
    }
  }
  return result
}
