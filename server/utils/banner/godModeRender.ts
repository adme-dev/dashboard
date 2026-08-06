import { randomUUID } from 'uncrypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getHeader, readBody } from 'h3'

import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { BannerRenderError } from '~~/server/utils/banner/renderJob'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const coordinationKey = Symbol('godModeBannerRender')
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
const LEDGER = 'god_mode_execution_ledger'
const ATTEMPT = `actor_user_id=$1 AND channel='application' AND idempotency_key=$2`
const OWNED = `${ATTEMPT} AND correlation_id=$3 AND state='in_progress'`

type TransactionDb = Pick<Pool, 'query'>
type ExecutionRow = {
  state: string
  route_or_tool: string
  request_digest: string | null
  job_ids: unknown
}
type Coordination = {
  actor: string
  correlation: string
  key: string
  ids: string[]
  stage: -1 | 0 | 1 | 2
  deps: GodModeBannerRenderDependencies
}

export interface GodModeBannerRenderDependencies {
  queryOneFresh: typeof queryOneFresh
  transaction: typeof transactionWithoutRetry
  appendAudit: typeof appendGodModeAuditEvent
  digestRequest: (event: H3Event) => Promise<string>
  randomUUID: () => string
}

const defaultDependencies: GodModeBannerRenderDependencies = {
  queryOneFresh,
  transaction: transactionWithoutRetry,
  appendAudit: appendGodModeAuditEvent,
  digestRequest: async event => digestMcpRequestBody(await readBody(event)),
  randomUUID
}

function httpError(statusCode: number, statusMessage: string) {
  return createError({ statusCode, statusMessage })
}

function parseJobIds(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 && value.length <= 10
    && value.every(id => typeof id === 'string' && UUID.test(id))
    ? value as string[]
    : null
}

async function persistTerminal(current: Coordination, terminal: GodModeAuditEventInput): Promise<void> {
  if (current.stage < 0) return await current.deps.appendAudit(terminal)
  const succeeded = terminal.phase === 'succeeded' && current.stage === 2
  const ambiguous = current.stage > 0 && !succeeded
  const phase = succeeded ? 'succeeded' : ambiguous ? 'ambiguous' : 'failed'
  const audit: GodModeAuditEventInput = {
    ...terminal,
    phase,
    outcomeCode: ambiguous ? 'dispatch_outcome_unknown' : succeeded ? terminal.outcomeCode : 'dispatch_not_started'
  }
  await current.deps.transaction(async (db: TransactionDb) => {
    const updated = await db.query(
      `UPDATE ${LEDGER} SET state=$4::VARCHAR,result_reference=$5,result_digest=$6,execution_phase=CASE WHEN $4::VARCHAR='succeeded' THEN 'result_captured' ELSE execution_phase END,updated_at=NOW() WHERE ${OWNED} RETURNING state`,
      [
        current.actor,
        current.key,
        current.correlation,
        phase,
        succeeded ? current.ids[0] : null,
        succeeded ? await digestMcpRequestBody(current.ids) : null
      ]
    )
    if (!updated.rows[0]) throw new Error('Banner render claim ownership changed')
    await current.deps.appendAudit(audit, db)
  })
}

export async function prepareGodModeBannerRender(
  event: H3Event,
  dependencies: GodModeBannerRenderDependencies = defaultDependencies
): Promise<{ strategy: 'task5-execution-ledger', prepared: true, persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void> }> {
  const state = getGodModeRouteAuditState(event)
  if (!state) throw new Error('God mode route attempt is unavailable')
  const suppliedKey = getHeader(event, 'idempotency-key')?.trim() || ''
  if (!IDEMPOTENCY_KEY.test(suppliedKey)) {
    throw httpError(428, 'A valid Idempotency-Key header is required for God mode banner renders')
  }
  const requestDigest = await dependencies.digestRequest(event)
  const row = await dependencies.queryOneFresh<ExecutionRow & { claimed: boolean }>(
    `WITH claimed AS(INSERT INTO ${LEDGER}(actor_user_id,channel,idempotency_key,state,correlation_id,route_or_tool,executor_class,session_digest,execution_phase,execution_metadata)VALUES($1,'application',$2,'in_progress',$3,$4,'external-provider',$5,'claimed',jsonb_build_object('requestDigest',$6::TEXT))ON CONFLICT(actor_user_id,channel,idempotency_key)DO NOTHING RETURNING state,route_or_tool,execution_metadata->>'requestDigest' request_digest,execution_metadata->'jobIds' job_ids,TRUE claimed)SELECT * FROM claimed UNION ALL SELECT state,route_or_tool,execution_metadata->>'requestDigest',execution_metadata->'jobIds',FALSE FROM ${LEDGER} WHERE ${ATTEMPT} AND NOT EXISTS(SELECT 1 FROM claimed)LIMIT 1`,
    [state.actorUserId, suppliedKey, state.correlationId, state.routeOrTool, state.sessionDigest, requestDigest]
  )
  if (!row) throw new Error('Banner render claim unavailable')
  if (row.route_or_tool !== state.routeOrTool) throw httpError(409, 'Idempotency key belongs to another operation')
  if (row.request_digest !== requestDigest) throw httpError(409, 'Idempotency key request does not match')
  const replayIds = parseJobIds(row.job_ids)
  const replay = !row.claimed && row.state === 'succeeded' && !!replayIds
  if (!row.claimed && !replay) throw httpError(409, 'God mode banner render is not safely replayable')
  const current: Coordination = {
    actor: state.actorUserId,
    correlation: state.correlationId,
    key: suppliedKey,
    ids: replayIds ?? [],
    stage: replay ? -1 : 0,
    deps: dependencies
  }
  ;(event.context as Record<PropertyKey, unknown>)[coordinationKey] = current
  return {
    strategy: 'task5-execution-ledger',
    prepared: true,
    persistTerminal: terminal => persistTerminal(current, terminal)
  }
}

export async function executeGodModeBannerRender(
  event: H3Event,
  formatCount: number,
  render: (genId: () => string, markDispatched: () => Promise<void>) => Promise<{ jobIds: string[] }>
): Promise<{ jobIds: string[] }> {
  const current = ((event.context as Record<PropertyKey, unknown>)[coordinationKey] as Coordination | undefined) ?? null
  if (!current) return await render(randomUUID, async () => {})
  if (current.stage < 0) return { jobIds: current.ids }
  if (!Number.isInteger(formatCount) || formatCount < 1) throw new BannerRenderError('formats array is required')
  if (formatCount > 10) throw new BannerRenderError('Max 10 formats per export')
  const candidates = Array.from({ length: formatCount }, current.deps.randomUUID)
  const reserved = await current.deps.queryOneFresh<{ job_ids: unknown }>(
    `UPDATE ${LEDGER} SET execution_metadata=execution_metadata||jsonb_build_object('jobIds',$4::jsonb),updated_at=NOW() WHERE ${OWNED} AND execution_phase='claimed' AND NOT(execution_metadata?'jobIds')RETURNING execution_metadata->'jobIds' job_ids`,
    [current.actor, current.key, current.correlation, JSON.stringify(candidates)]
  )
  current.ids = parseJobIds(reserved?.job_ids) ?? []
  if (current.ids.length !== formatCount) throw new Error('Banner render reservation unavailable')
  let index = 0
  const result = await render(
    () => current.ids[index++] ?? (() => { throw new Error('Banner render identity exhausted') })(),
    async () => {
      if (current.stage > 0) return
      const checkpoint = await current.deps.queryOneFresh<{ state: string }>(
        `UPDATE ${LEDGER} SET execution_phase = 'dispatched',updated_at=NOW() WHERE ${OWNED} AND execution_phase='claimed' RETURNING state`,
        [current.actor, current.key, current.correlation]
      )
      if (!checkpoint) throw new Error('Banner render dispatch checkpoint unavailable')
      current.stage = 1
    }
  )
  if (index !== formatCount || result.jobIds.length !== current.ids.length
    || result.jobIds.some((id, resultIndex) => id !== current.ids[resultIndex])) {
    throw new Error('Banner render returned an unexpected result')
  }
  current.stage = 2
  return result
}
