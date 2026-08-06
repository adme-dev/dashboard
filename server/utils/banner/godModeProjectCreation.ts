import { createHash } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getHeader, readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const ROUTE = '/api/agency/banner-studio/projects'
const coordinationKey = Symbol('godModeBannerProjectCreation')
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

type TransactionDb = Pick<Pool, 'query'>

export interface GodModeBannerProjectCreationDependencies {
  transaction: typeof transaction
  appendAudit: typeof appendGodModeAuditEvent
  digestRequest: (event: H3Event) => Promise<string>
}

interface Coordination {
  db: TransactionDb
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

const defaultDependencies: GodModeBannerProjectCreationDependencies = {
  transaction,
  appendAudit: appendGodModeAuditEvent,
  digestRequest: async event => await digestMcpRequestBody(await readBody(event))
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

export async function prepareGodModeBannerProjectCreation(
  event: H3Event,
  dependencies: GodModeBannerProjectCreationDependencies = defaultDependencies,
  terminalAuditEvent: (
    terminal: GodModeAuditEventInput,
    resultReference: string | null
  ) => GodModeAuditEventInput = (terminal, resultReference) => resultReference
    ? { ...terminal, entityType: 'banner_project', entityId: resultReference }
    : terminal
): Promise<{ strategy: 'transaction-bound', prepared: true, persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void> }> {
  const state = getGodModeRouteAuditState(event)
  const idempotencyKey = getHeader(event, 'idempotency-key')?.trim() || ''
  if (!state) throw new Error('God mode route attempt is unavailable')
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw createError({
      statusCode: 428,
      statusMessage: 'A stable Idempotency-Key header is required for God mode project creation'
    })
  }
  const requestDigest = await dependencies.digestRequest(event)

  const ready = deferred<Coordination>()
  const terminal = deferred<GodModeAuditEventInput>()
  let readySettled = false

  const transactionPromise = dependencies.transaction(async (db) => {
    const claimed = await db.query(
      `INSERT INTO god_mode_execution_ledger (
         actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
         executor_class, session_digest, execution_phase, execution_metadata
       ) VALUES ($1, 'application', $2, 'in_progress', $3, $4, 'local-transactional', $5, 'claimed',
                 jsonb_build_object('requestDigest', $6::TEXT))
       ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING
       RETURNING state`,
      [state.actorUserId, idempotencyKey, state.correlationId, state.routeOrTool, state.sessionDigest, requestDigest]
    )

    let mode: Coordination['mode'] = 'execute'
    let resultReference: string | null = null
    if (!claimed.rows[0]) {
      const existing = await db.query(
        `SELECT state, result_reference, route_or_tool,
                execution_metadata ->> 'requestDigest' AS request_digest
           FROM god_mode_execution_ledger
          WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2
          FOR UPDATE`,
        [state.actorUserId, idempotencyKey]
      )
      const row = existing.rows[0] as ExistingExecutionRow | undefined
      if (!row || row.route_or_tool !== state.routeOrTool) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key belongs to another operation' })
      }
      if (row.request_digest !== requestDigest) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key request does not match' })
      }
      if (row.state !== 'succeeded' || !row.result_reference) {
        throw createError({ statusCode: 409, statusMessage: 'God mode project creation is not safely replayable' })
      }
      mode = 'replay'
      resultReference = row.result_reference
    }

    const current: Coordination = {
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
      throw new Error('Banner project mutation did not produce a durable result')
    }

    if (current.mode === 'execute' && current.savepointOpen) {
      if (finalEvent.phase === 'succeeded') {
        await db.query('RELEASE SAVEPOINT god_mode_banner_project_create')
      } else {
        await db.query('ROLLBACK TO SAVEPOINT god_mode_banner_project_create')
        await db.query('RELEASE SAVEPOINT god_mode_banner_project_create')
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
        `UPDATE god_mode_execution_ledger
            SET state = $3::VARCHAR, result_reference = $4, result_digest = $5,
                execution_phase = CASE WHEN $3::VARCHAR = 'succeeded' THEN 'result_captured' ELSE execution_phase END,
                updated_at = NOW()
          WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2`,
        [
          current.actorUserId,
          current.idempotencyKey,
          finalEvent.phase === 'succeeded' ? 'succeeded' : 'failed',
          finalEvent.phase === 'succeeded' ? current.resultReference : null,
          finalEvent.phase === 'succeeded' ? resultDigest : null
        ]
      )
    }
    await dependencies.appendAudit(terminalAuditEvent(finalEvent, current.resultReference), db)
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

export async function executeGodModeBannerProjectCreation<T extends { id: string }>(
  event: H3Event,
  create: (db: TransactionDb) => Promise<T>,
  replay?: (db: TransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const current = coordination(event)
  if (!current) return await transaction(db => create(db))

  await current.db.query('SAVEPOINT god_mode_banner_project_create')
  current.savepointOpen = true
  try {
    let project: T
    if (current.mode === 'replay') {
      if (replay) {
        project = await replay(current.db, current.resultReference!)
      } else {
        const result = await current.db.query(
          `SELECT id, name, client_id AS "clientId", canvas_data AS "canvasData", thumbnail_url AS "thumbnailUrl", status, tags, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt" FROM banner_projects WHERE id = $1`,
          [current.resultReference]
        )
        if (!result.rows[0]) throw new Error('Replayed banner project no longer exists')
        project = result.rows[0] as T
      }
    } else {
      project = await create(current.db)
      current.resultReference = project.id
    }
    current.mutationSettled = true
    if (current.mode === 'replay') {
      await current.db.query('RELEASE SAVEPOINT god_mode_banner_project_create')
      current.savepointOpen = false
    }
    return project
  } catch (error) {
    await current.db.query('ROLLBACK TO SAVEPOINT god_mode_banner_project_create')
    await current.db.query('RELEASE SAVEPOINT god_mode_banner_project_create')
    current.savepointOpen = false
    throw error
  }
}

export function registerGodModeBannerProjectCreationFamily(
  dependencies: GodModeBannerProjectCreationDependencies = defaultDependencies
): () => void {
  return registerGodModeMutationFamily({
    family: 'banner-project-creation',
    method: 'POST',
    matchesPath: path => path === ROUTE,
    prepare: event => prepareGodModeBannerProjectCreation(event, dependencies)
  })
}
