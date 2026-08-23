// God mode coordination for mutations that fan out to an external provider
// (Queues, R2, AI Gateway) and therefore cannot run inside one DB transaction.
//
// Generalises the banner render ledger protocol (server/utils/banner/godModeRender.ts):
//   1. prepare  — claim an execution-ledger row by Idempotency-Key, or detect replay.
//   2. execute  — reserve N durable ids *before* any side effect, run the route's
//                 work with those ids, checkpoint 'dispatched' once the provider has
//                 been handed the work, and stash a replay payload on success.
//   3. terminal — persisted by the audit plugin via persistTerminal(): success /
//                 failed / ambiguous (provider may have been dispatched).
// Replays of a succeeded key return the reserved ids + stored payload without
// touching the provider again.
import { randomUUID } from 'uncrypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getHeader, readBody } from 'h3'

import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
const LEDGER = 'god_mode_execution_ledger'
const ATTEMPT = `actor_user_id=$1 AND channel='application' AND idempotency_key=$2`
const OWNED = `${ATTEMPT} AND correlation_id=$3 AND state='in_progress'`
const MAX_IDS = 10

type TransactionDb = Pick<Pool, 'query'>
type ExecutionRow = {
  state: string
  route_or_tool: string
  request_digest: string | null
  ids: unknown
  result: unknown
}

export interface GodModeExternalLedgerDependencies {
  queryOneFresh: typeof queryOneFresh
  transaction: typeof transactionWithoutRetry
  appendAudit: typeof appendGodModeAuditEvent
  digestRequest: (event: H3Event) => Promise<string>
  randomUUID: () => string
}

// Deps are called through lazily so that importing this module under a partial
// `~~/server/utils/db` mock (common in route tests) never touches them.
export const defaultExternalLedgerDependencies: GodModeExternalLedgerDependencies = {
  queryOneFresh: (...args) => queryOneFresh(...args),
  transaction: (...args) => transactionWithoutRetry(...args),
  appendAudit: (...args) => appendGodModeAuditEvent(...args),
  digestRequest: async event => digestMcpRequestBody((await readBody(event).catch(() => null)) ?? {}),
  randomUUID
}

/** Per-family labels: the mutation name appears in 4xx messages and audit rows. */
export interface GodModeExternalMutation {
  /** e.g. 'video render' — completes "God mode video render is not safely replayable". */
  label: string
  /** Per-family context slot so two families on one event never collide. */
  coordinationKey: symbol
  /** Optional exact wording overrides (kept for families with pre-existing contracts). */
  messages?: Partial<GodModeExternalMessages>
}

export interface GodModeExternalMessages {
  keyRequired: string
  notReplayable: string
  claimUnavailable: string
  claimChanged: string
  reservationUnavailable: string
  checkpointUnavailable: string
}

function messages(mutation: GodModeExternalMutation): GodModeExternalMessages {
  return {
    keyRequired: `A valid Idempotency-Key header is required for God mode ${mutation.label}`,
    notReplayable: `God mode ${mutation.label} is not safely replayable`,
    claimUnavailable: `God mode ${mutation.label} claim unavailable`,
    claimChanged: `God mode ${mutation.label} claim ownership changed`,
    reservationUnavailable: `God mode ${mutation.label} reservation unavailable`,
    checkpointUnavailable: `God mode ${mutation.label} dispatch checkpoint unavailable`,
    ...mutation.messages
  }
}

interface Coordination {
  actor: string
  correlation: string
  key: string
  ids: string[]
  result: unknown
  /** -1 replay · 0 claimed · 1 dispatched · 2 succeeded */
  stage: -1 | 0 | 1 | 2
  deps: GodModeExternalLedgerDependencies
  mutation: GodModeExternalMutation
}

function httpError(statusCode: number, statusMessage: string) {
  return createError({ statusCode, statusMessage })
}

function parseIds(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_IDS
    && value.every(id => typeof id === 'string' && UUID.test(id))
    ? value as string[]
    : null
}

async function persistTerminal(current: Coordination, terminal: GodModeAuditEventInput): Promise<void> {
  if (current.stage < 0) return await current.deps.appendAudit(terminal)
  const succeeded = terminal.phase === 'succeeded' && current.stage === 2
  // Dispatched-but-not-succeeded: the provider may hold the work → ambiguous, never 'failed'.
  const ambiguous = current.stage > 0 && !succeeded
  const phase = succeeded ? 'succeeded' : ambiguous ? 'ambiguous' : 'failed'
  const audit: GodModeAuditEventInput = {
    ...terminal,
    phase,
    outcomeCode: ambiguous ? 'dispatch_outcome_unknown' : succeeded ? terminal.outcomeCode : 'dispatch_not_started'
  }
  await current.deps.transaction(async (db: TransactionDb) => {
    const updated = await db.query(
      `UPDATE ${LEDGER} SET state=$4::VARCHAR,result_reference=$5,result_digest=$6,execution_metadata=execution_metadata||jsonb_build_object('result',$7::jsonb),execution_phase=CASE WHEN $4::VARCHAR='succeeded' THEN 'result_captured' ELSE execution_phase END,updated_at=NOW() WHERE ${OWNED} RETURNING state`,
      [
        current.actor,
        current.key,
        current.correlation,
        phase,
        succeeded ? current.ids[0] : null,
        succeeded ? await digestMcpRequestBody(current.ids) : null,
        JSON.stringify(succeeded ? (current.result ?? null) : null)
      ]
    )
    if (!updated.rows[0]) throw new Error(messages(current.mutation).claimChanged)
    await current.deps.appendAudit(audit, db)
  })
}

export async function prepareGodModeExternalMutation(
  event: H3Event,
  mutation: GodModeExternalMutation,
  dependencies: GodModeExternalLedgerDependencies = defaultExternalLedgerDependencies
): Promise<{ strategy: 'task5-execution-ledger', prepared: true, persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void> }> {
  const state = getGodModeRouteAuditState(event)
  if (!state) throw new Error('God mode route attempt is unavailable')
  const suppliedKey = getHeader(event, 'idempotency-key')?.trim() || ''
  if (!IDEMPOTENCY_KEY.test(suppliedKey)) {
    throw httpError(428, messages(mutation).keyRequired)
  }
  const requestDigest = await dependencies.digestRequest(event)
  const row = await dependencies.queryOneFresh<ExecutionRow & { claimed: boolean }>(
    `WITH claimed AS(INSERT INTO ${LEDGER}(actor_user_id,channel,idempotency_key,state,correlation_id,route_or_tool,executor_class,session_digest,execution_phase,execution_metadata)VALUES($1,'application',$2,'in_progress',$3,$4,'external-provider',$5,'claimed',jsonb_build_object('requestDigest',$6::TEXT))ON CONFLICT(actor_user_id,channel,idempotency_key)DO NOTHING RETURNING state,route_or_tool,execution_metadata->>'requestDigest' request_digest,execution_metadata->'ids' ids,execution_metadata->'result' result,TRUE claimed)SELECT * FROM claimed UNION ALL SELECT state,route_or_tool,execution_metadata->>'requestDigest',execution_metadata->'ids',execution_metadata->'result',FALSE FROM ${LEDGER} WHERE ${ATTEMPT} AND NOT EXISTS(SELECT 1 FROM claimed)LIMIT 1`,
    [state.actorUserId, suppliedKey, state.correlationId, state.routeOrTool, state.sessionDigest, requestDigest]
  )
  if (!row) throw new Error(messages(mutation).claimUnavailable)
  if (row.route_or_tool !== state.routeOrTool) throw httpError(409, 'Idempotency key belongs to another operation')
  if (row.request_digest !== requestDigest) throw httpError(409, 'Idempotency key request does not match')
  const replayIds = parseIds(row.ids)
  const replay = !row.claimed && row.state === 'succeeded' && !!replayIds
  if (!row.claimed && !replay) throw httpError(409, messages(mutation).notReplayable)
  const current: Coordination = {
    actor: state.actorUserId,
    correlation: state.correlationId,
    key: suppliedKey,
    ids: replayIds ?? [],
    result: replay ? row.result ?? null : null,
    stage: replay ? -1 : 0,
    deps: dependencies,
    mutation
  }
  ;((event.context ??= {} as typeof event.context) as Record<PropertyKey, unknown>)[mutation.coordinationKey] = current
  return {
    strategy: 'task5-execution-ledger',
    prepared: true,
    persistTerminal: terminal => persistTerminal(current, terminal)
  }
}

export interface GodModeExternalRun<T> {
  /** Durable ids the work must use (reserved before any side effect). */
  ids: string[]
  /** Call once the provider has accepted the work (queue message sent, file stored). */
  markDispatched: () => Promise<void>
  /** True when this is a replay of a succeeded key; `replayResult` is what was stored. */
  replay: boolean
  replayResult: T | null
}

/**
 * Run `work` under God mode coordination. For ordinary staff (no prepared
 * coordination) it runs directly with fresh ids. The result the callback returns
 * is stored for replay; it must be JSON-serialisable and ≤ a few KB.
 */
export async function executeGodModeExternalMutation<T>(
  event: H3Event,
  mutation: GodModeExternalMutation,
  idCount: number,
  work: (run: GodModeExternalRun<T>) => Promise<T>
): Promise<T> {
  const current = ((event.context as Record<PropertyKey, unknown> | undefined)?.[mutation.coordinationKey] as Coordination | undefined) ?? null
  if (!Number.isInteger(idCount) || idCount < 1 || idCount > MAX_IDS) {
    throw new Error(`God mode ${mutation.label} id count out of range`)
  }
  if (!current) {
    return await work({
      ids: Array.from({ length: idCount }, randomUUID),
      markDispatched: async () => {},
      replay: false,
      replayResult: null
    })
  }
  if (current.stage < 0) {
    return await work({ ids: current.ids, markDispatched: async () => {}, replay: true, replayResult: current.result as T | null })
  }
  const candidates = Array.from({ length: idCount }, current.deps.randomUUID)
  const reserved = await current.deps.queryOneFresh<{ ids: unknown }>(
    `UPDATE ${LEDGER} SET execution_metadata=execution_metadata||jsonb_build_object('ids',$4::jsonb),updated_at=NOW() WHERE ${OWNED} AND execution_phase='claimed' AND NOT(execution_metadata?'ids')RETURNING execution_metadata->'ids' ids`,
    [current.actor, current.key, current.correlation, JSON.stringify(candidates)]
  )
  current.ids = parseIds(reserved?.ids) ?? []
  if (current.ids.length !== idCount) throw new Error(messages(mutation).reservationUnavailable)

  const result = await work({
    ids: current.ids,
    replay: false,
    replayResult: null,
    markDispatched: async () => {
      if (current.stage > 0) return
      const checkpoint = await current.deps.queryOneFresh<{ state: string }>(
        `UPDATE ${LEDGER} SET execution_phase='dispatched',updated_at=NOW() WHERE ${OWNED} AND execution_phase='claimed' RETURNING state`,
        [current.actor, current.key, current.correlation]
      )
      if (!checkpoint) throw new Error(messages(mutation).checkpointUnavailable)
      current.stage = 1
    }
  })
  current.result = result ?? null
  current.stage = 2
  return result
}
