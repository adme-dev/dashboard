import { queryOneFresh, queryRows, transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from './audit'
import type { ExecutorClass } from '~~/server/utils/ai/executors/types'

export interface ReconciliationCandidate {
  actorUserId: string
  correlationId: string
  idempotencyKey: string
  state: 'in_progress' | 'ambiguous'
  routeOrTool: string
  executorClass: ExecutorClass
  sessionDigest: string
  tenantId: string | null
  clientId: string | null
  resultReference: string | null
}

export interface ReconciledProviderOutcome {
  state: 'succeeded' | 'failed' | 'unknown'
  resultReference?: string | null
}

export interface GodModeReconciliationDependencies {
  listCandidates: (limit: number) => Promise<ReconciliationCandidate[]>
  findTerminal: (correlationId: string) => Promise<{ phase: 'succeeded' | 'failed', outcomeCode: string } | null>
  /** Lookup only. Implementations must never dispatch or repeat an action. */
  lookupOutcome: (candidate: ReconciliationCandidate) => Promise<ReconciledProviderOutcome>
  /** A null terminal means an immutable terminal already exists; close only the coordination row. */
  appendTerminalAndClose: (candidate: ReconciliationCandidate, terminal: GodModeAuditEventInput | null) => Promise<boolean>
  markAlertable: (candidate: ReconciliationCandidate, reason: 'provider_outcome_unknown' | 'provider_lookup_failed') => Promise<void>
}

const defaultDependencies: GodModeReconciliationDependencies = {
  listCandidates: async limit => {
    const rows = await queryRows<any>(
      `SELECT actor_user_id, correlation_id, idempotency_key, state, route_or_tool,
              executor_class, session_digest, tenant_id, client_id, result_reference
         FROM god_mode_execution_ledger
        WHERE channel = 'application'
          AND state IN ('in_progress', 'ambiguous')
          AND updated_at < NOW() - INTERVAL '5 minutes'
        ORDER BY updated_at, actor_user_id, idempotency_key
        LIMIT $1`,
      [limit]
    )
    return rows.map(row => ({
      actorUserId: row.actor_user_id,
      correlationId: row.correlation_id,
      idempotencyKey: row.idempotency_key,
      state: row.state,
      routeOrTool: row.route_or_tool,
      executorClass: row.executor_class,
      sessionDigest: row.session_digest,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      resultReference: row.result_reference
    }))
  },
  findTerminal: async correlationId => await queryOneFresh(
    `SELECT phase, outcome_code AS "outcomeCode"
       FROM god_mode_audit_events
      WHERE correlation_id = $1 AND phase IN ('succeeded', 'failed')
      LIMIT 1`,
    [correlationId]
  ),
  lookupOutcome: async candidate => {
    // No current executor talks directly to an external provider. For internal HTTP calls, a
    // persisted result reference is the captured bounded response from the completed dispatch.
    // Missing references remain unknown; reconciliation never calls the mutation endpoint.
    if (candidate.resultReference) {
      return { state: 'succeeded', resultReference: candidate.resultReference }
    }
    return { state: 'unknown' }
  },
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
          SET state = $4, updated_at = NOW()
        WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2
          AND correlation_id = $3 AND state IN ('in_progress', 'ambiguous')`,
      [candidate.actorUserId, candidate.idempotencyKey, candidate.correlationId, terminalPhase]
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

function terminal(candidate: ReconciliationCandidate, outcome: Exclude<ReconciledProviderOutcome['state'], 'unknown'>): GodModeAuditEventInput {
  return {
    actorUserId: candidate.actorUserId,
    correlationId: candidate.correlationId,
    sessionDigest: candidate.sessionDigest,
    channel: 'application',
    routeOrTool: candidate.routeOrTool,
    phase: outcome,
    tenantId: candidate.tenantId,
    clientId: candidate.clientId,
    bypassedControls: ['confirmation'],
    outcomeCode: outcome === 'succeeded' ? 'reconciled_succeeded' : 'reconciled_failed',
    emergencyDisabled: false
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
      if (await dependencies.appendTerminalAndClose(candidate, terminal(candidate, outcome.state))) {
        result.reconciled++
      }
    } catch {
      result.failed++
      await dependencies.markAlertable(candidate, 'provider_lookup_failed').catch(() => {})
    }
  }
  return result
}
