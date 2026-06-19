import { execute } from '~~/server/utils/db'

/**
 * Phase-0 WS-C.2: persist one ai_action_audit row per attempted write action.
 *
 * Design: a PURE `auditParams` mapper (unit-tested) + a fail-safe `recordAudit` writer. Audit must
 * NEVER break the action it records — a write failure here is logged and swallowed. The DB writer is
 * injected so the logic is testable without mocking the module.
 */

export type AuditOutcome = 'executed' | 'failed' | 'rolled_back'

export interface AuditInput {
  pendingId: string
  userId: string                 // proposer
  confirmedBy: string | null     // approver
  toolName: string
  riskTier: string               // auto | confirm | rich_confirm
  clientScope?: string | null    // set for portal/tenant-scoped actions
  payload: unknown
  resultRef?: string | null
  outcome: AuditOutcome
}

const INSERT_SQL =
  `INSERT INTO ai_action_audit
     (pending_id, user_id, confirmed_by, tool_name, risk_tier, client_scope, payload, result_ref, outcome)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`

/** Pure: ordered insert params for an audit row. Keeps the SQL binding in one tested place. */
export function auditParams(a: AuditInput): unknown[] {
  return [
    a.pendingId,
    a.userId,
    a.confirmedBy,
    a.toolName,
    a.riskTier,
    a.clientScope ?? null,
    JSON.stringify(a.payload ?? {}),
    a.resultRef ?? null,
    a.outcome,
  ]
}

export type AuditWriter = (sql: string, params: unknown[]) => Promise<unknown>

/** Persist an audit row. Fail-safe: never throws into the request path. */
export async function recordAudit(a: AuditInput, write: AuditWriter = execute): Promise<void> {
  try {
    await write(INSERT_SQL, auditParams(a))
  } catch (err) {
    console.error('[ai-audit] failed to record action audit', err)
  }
}
