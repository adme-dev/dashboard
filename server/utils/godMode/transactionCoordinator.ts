import { createHash } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

import type { GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'

const coordinationKey = Symbol('godModeTransactionCoordination')
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const SAVEPOINT = 'god_mode_coordinated_mutation'

export type GodModeTransactionDb = Pick<Pool, 'query'>

export interface GodModeTransactionCoordinatorDependencies {
  transaction: <T>(callback: (db: GodModeTransactionDb) => Promise<T>) => Promise<T>
  appendAudit: (event: GodModeAuditEventInput, db: GodModeTransactionDb) => Promise<void>
  digestRequest: (event: H3Event) => Promise<string>
}

export interface GodModeTransactionOperation {
  readonly identity: symbol
  readonly routeOrTool: string
  readonly mutationName: string
  readonly missingResultMessage: string
  readonly unreplayableErrorCode?: string
  readonly retryableInProgress?: boolean
}

interface Coordination {
  operationIdentity: symbol
  db: GodModeTransactionDb
  actorUserId: string
  idempotencyKey: string
  mode: 'execute' | 'replay'
  resultReference: string | null
  mutationSettled: boolean
  savepointOpen: boolean
  finish: (terminal: GodModeAuditEventInput) => Promise<void>
}

interface ExistingExecutionRow {
  state: string
  result_reference: string | null
  route_or_tool: string
  request_digest: string | null
}

export function defineGodModeTransactionOperation(
  config: Omit<GodModeTransactionOperation, 'identity'>
): GodModeTransactionOperation {
  return Object.freeze({ ...config, identity: Symbol(config.routeOrTool) })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function coordination(event: H3Event): Coordination | null {
  return ((event.context as Record<PropertyKey, unknown>)[coordinationKey] as Coordination | undefined) ?? null
}

function unreplayableError(operation: GodModeTransactionOperation) {
  const error = {
    statusCode: 409,
    statusMessage: `God mode ${operation.mutationName} is not safely replayable`
  }
  return createError(operation.unreplayableErrorCode
    ? { ...error, data: { code: operation.unreplayableErrorCode } }
    : error)
}

export async function prepareGodModeTransactionMutation(
  event: H3Event,
  operation: GodModeTransactionOperation,
  dependencies: GodModeTransactionCoordinatorDependencies
): Promise<{
  strategy: 'transaction-bound'
  prepared: true
  persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void>
}> {
  const state = getGodModeRouteAuditState(event)
  const idempotencyKey = getHeader(event, 'idempotency-key')?.trim() || ''
  if (!state) throw new Error('God mode route attempt is unavailable')
  if (state.routeOrTool !== operation.routeOrTool) {
    throw createError({ statusCode: 409, statusMessage: 'God mode coordinator belongs to another operation' })
  }
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw createError({
      statusCode: 428,
      statusMessage: `A stable Idempotency-Key header is required for God mode ${operation.mutationName}`
    })
  }
  const requestDigest = await dependencies.digestRequest(event)

  const ready = deferred<Coordination>()
  const terminal = deferred<GodModeAuditEventInput>()
  let readySettled = false

  const transactionPromise = dependencies.transaction(async (db) => {
    const claimed = await db.query(
      `INSERT INTO god_mode_execution_ledger (actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool, executor_class, session_digest, execution_phase, execution_metadata) VALUES ($1, 'application', $2, 'in_progress', $3, $4, 'local-transactional', $5, 'claimed', jsonb_build_object('requestDigest', $6::TEXT)) ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING RETURNING state`,
      [state.actorUserId, idempotencyKey, state.correlationId, state.routeOrTool, state.sessionDigest, requestDigest]
    )

    let mode: Coordination['mode'] = 'execute'
    let resultReference: string | null = null
    if (!claimed.rows[0]) {
      const existing = await db.query(
        `SELECT state, result_reference, route_or_tool, execution_metadata ->> 'requestDigest' AS request_digest FROM god_mode_execution_ledger WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2 FOR UPDATE`,
        [state.actorUserId, idempotencyKey]
      )
      const row = existing.rows[0] as ExistingExecutionRow | undefined
      if (!row || row.route_or_tool !== state.routeOrTool) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key belongs to another operation' })
      }
      if (row.request_digest !== requestDigest) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key request does not match' })
      }
      if (operation.retryableInProgress && (row.state === 'in_progress' || row.state === 'ambiguous')) {
        throw createError({
          statusCode: 409,
          statusMessage: `God mode ${operation.mutationName} is still in progress`
        })
      }
      if (row.state !== 'succeeded' || !row.result_reference) throw unreplayableError(operation)
      mode = 'replay'
      resultReference = row.result_reference
    }

    const current: Coordination = {
      operationIdentity: operation.identity,
      db,
      actorUserId: state.actorUserId,
      idempotencyKey,
      mode,
      resultReference,
      mutationSettled: false,
      savepointOpen: false,
      finish: async () => {}
    }
    ;(event.context as Record<PropertyKey, unknown>)[coordinationKey] = current
    readySettled = true
    ready.resolve(current)

    const finalEvent = await terminal.promise
    if (finalEvent.phase === 'succeeded' && (!current.mutationSettled || !current.resultReference)) {
      throw new Error(operation.missingResultMessage)
    }

    if (current.mode === 'execute' && current.savepointOpen) {
      if (finalEvent.phase === 'succeeded') {
        await db.query(`RELEASE SAVEPOINT ${SAVEPOINT}`)
      } else {
        await db.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`)
        await db.query(`RELEASE SAVEPOINT ${SAVEPOINT}`)
        current.resultReference = null
        current.mutationSettled = false
      }
      current.savepointOpen = false
    }

    if (current.mode === 'execute') {
      const resultDigest = current.resultReference
        ? createHash('sha256').update(current.resultReference).digest('hex')
        : null
      await db.query(
        `UPDATE god_mode_execution_ledger SET state = $3::VARCHAR, result_reference = $4, result_digest = $5, execution_phase = CASE WHEN $3::VARCHAR = 'succeeded' THEN 'result_captured' ELSE execution_phase END, updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2`,
        [
          current.actorUserId,
          current.idempotencyKey,
          finalEvent.phase === 'succeeded' ? 'succeeded' : 'failed',
          finalEvent.phase === 'succeeded' ? current.resultReference : null,
          finalEvent.phase === 'succeeded' ? resultDigest : null
        ]
      )
    }
    // Attempt identity is immutable under migration 349. The result is linked only through
    // god_mode_execution_ledger.result_reference.
    await dependencies.appendAudit(finalEvent, db)
  })
  transactionPromise.catch((error) => {
    if (!readySettled) ready.reject(error)
  })

  const current = await ready.promise
  current.finish = async (finalEvent) => {
    terminal.resolve(finalEvent)
    await transactionPromise
  }

  return {
    strategy: 'transaction-bound',
    prepared: true,
    persistTerminal: current.finish
  }
}

export async function executeGodModeTransactionMutation<T extends { id: string }>(
  event: H3Event,
  operation: GodModeTransactionOperation,
  ordinaryTransaction: GodModeTransactionCoordinatorDependencies['transaction'],
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay?: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const current = coordination(event)
  if (!current) {
    if (getGodModeRouteAuditState(event)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'God mode mutation coordination unavailable'
      })
    }
    return await ordinaryTransaction(db => mutate(db))
  }
  if (current.operationIdentity !== operation.identity) {
    throw createError({ statusCode: 409, statusMessage: 'God mode coordinator belongs to another operation' })
  }

  await current.db.query(`SAVEPOINT ${SAVEPOINT}`)
  current.savepointOpen = true
  try {
    let result: T
    if (current.mode === 'replay') {
      if (!replay) {
        throw unreplayableError(operation)
      }
      result = await replay(current.db, current.resultReference!)
    } else {
      result = await mutate(current.db)
      current.resultReference = result.id
    }
    current.mutationSettled = true
    if (current.mode === 'replay') {
      await current.db.query(`RELEASE SAVEPOINT ${SAVEPOINT}`)
      current.savepointOpen = false
    }
    return result
  } catch (error) {
    await current.db.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`)
    await current.db.query(`RELEASE SAVEPOINT ${SAVEPOINT}`)
    current.savepointOpen = false
    throw error
  }
}
