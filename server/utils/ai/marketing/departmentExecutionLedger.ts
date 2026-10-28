import { createHash, randomUUID } from 'node:crypto'
import { fail, type ToolResult } from '../toolContext'

/** Minimal pg-style client used inside an open transaction. */
export interface LedgerDb {
  // pg row shape; kept `any` so pg clients and the Search Authority repository Db both satisfy it (shared with root consumers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number | null }>
}

export function departmentCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(departmentCanonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${departmentCanonicalJson(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export const sha256 = (value: unknown): string =>
  createHash('sha256').update(typeof value === 'string' ? value : departmentCanonicalJson(value)).digest('hex')

export function validExecutionIdentity(key: unknown, digest: unknown): key is string {
  return typeof key === 'string' && /^mcp:[0-9a-f]{64}$/.test(key)
    && typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest)
}

/** Thrown inside a transaction to roll everything back (including the claim) and return a typed refusal. */
export function refuse(message: string, code: string): never {
  throw Object.assign(new Error(message), { departmentResult: fail(message, code) })
}
export const refusalOf = (error: unknown): ToolResult | undefined =>
  (error as { departmentResult?: ToolResult } | null)?.departmentResult

export interface ExecutionIdentity {
  actorId: string
  key: string
  digest: string
  tool: string
  clientId: string
  /** Hash of the exact validated tool input; the key may never be reused for other input. */
  inputHash: string
  executor: 'local-transactional' | 'external-provider'
}

export type Claim
  = | { kind: 'fresh' }
    | { kind: 'replay', result: unknown }
    | { kind: 'conflict' }
    | { kind: 'pending', state: string }

const reference = (identity: Pick<ExecutionIdentity, 'inputHash'>) => `department:${identity.inputHash}`

export async function claimExecution(db: LedgerDb, identity: ExecutionIdentity): Promise<Claim> {
  const inserted = await db.query(`INSERT INTO god_mode_execution_ledger (
    actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
    executor_class, session_digest, execution_phase, client_id, result_reference
  ) VALUES ($1, 'mcp', $2, 'in_progress', $3, $4, $5, $6, 'claimed', $7, $8)
  ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING RETURNING state`,
  [identity.actorId, identity.key, randomUUID(), identity.tool, identity.executor, identity.digest, identity.clientId, reference(identity)])
  if (inserted.rows.length) return { kind: 'fresh' }
  const previous = (await db.query(`SELECT state, route_or_tool, result_reference, client_id, execution_metadata
    FROM god_mode_execution_ledger WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2 FOR UPDATE`,
  [identity.actorId, identity.key])).rows[0]
  if (!previous || previous.route_or_tool !== identity.tool || previous.result_reference !== reference(identity)
    || previous.client_id !== identity.clientId) return { kind: 'conflict' }
  if (previous.state === 'succeeded') return { kind: 'replay', result: previous.execution_metadata?.result ?? null }
  return { kind: 'pending', state: String(previous.state) }
}

/** Finishes a claimed row; `state` failed/ambiguous are used by provider executors only. */
export async function finishExecution(
  db: LedgerDb,
  identity: Pick<ExecutionIdentity, 'actorId' | 'key'>,
  result: Record<string, unknown>,
  state: 'succeeded' | 'failed' | 'ambiguous' = 'succeeded'
): Promise<void> {
  const metadata = JSON.stringify({ result })
  if (Buffer.byteLength(metadata) > 4000) throw new Error('Department result summary too large for the ledger')
  const phase = state === 'succeeded' ? 'result_captured' : state === 'ambiguous' ? 'dispatched' : 'claimed'
  const updated = await db.query(`UPDATE god_mode_execution_ledger SET state = $3, execution_phase = $4,
    result_digest = $5, execution_metadata = $6::jsonb, updated_at = NOW()
    WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2 AND state = 'in_progress'`,
  [identity.actorId, identity.key, state, phase, sha256(result), metadata])
  if (updated.rowCount !== 1) throw new Error('Department execution completion rejected')
}

export function claimOutcome(claim: Exclude<Claim, { kind: 'fresh' }>): ToolResult {
  if (claim.kind === 'conflict') return fail('Execution identity already used for different input', 'idempotency_conflict')
  if (claim.kind === 'pending') {
    return claim.state === 'failed'
      ? fail('This exact request already failed; prepare a new request after correcting the cause', 'failed')
      : fail('Execution outcome requires reconciliation; do not retry', 'reconciliation_required')
  }
  return { ok: true, data: { ...(claim.result as Record<string, unknown> ?? {}), replayed: true } }
}
