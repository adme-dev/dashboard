import { createHash } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

import {
  getTransactionFailureStage,
  queryOneFresh,
  transactionWithoutRetry
} from '~~/server/utils/db'
import { deleteBannerFile } from '~~/server/utils/bannerStorage'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'

const ROUTE = '/api/agency/banner-studio/assets/upload'
const coordinationKey = Symbol('godModeBannerAssetUpload')
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const REQUEST_DIGEST = /^[a-f0-9]{64}$/
const SAVEPOINT = 'god_mode_banner_asset_upload'

type TransactionDb = Pick<Pool, 'query'>

export interface BannerAssetUploadResult {
  id: string
  name: string
  mimeType: string
  fileSize: number
  r2Key: string
  url: string
  thumbnailUrl: string | null
  tags: string[]
  uploadedBy: string
  createdAt: string
}

export interface StoredBannerAssetUpload {
  key: string
  url: string
  size: number
}

export interface BannerAssetUploadMutation {
  r2Key: string
  uploadFile: (r2Key: string) => Promise<StoredBannerAssetUpload>
  deleteFile?: (r2Key: string) => Promise<void>
  insertAsset: (
    db: TransactionDb | null,
    stored: StoredBannerAssetUpload
  ) => Promise<BannerAssetUploadResult>
}

export interface GodModeBannerAssetUploadDependencies {
  transaction: typeof transactionWithoutRetry
  appendAudit: typeof appendGodModeAuditEvent
  deleteBannerFile: typeof deleteBannerFile
  queryOneFresh: typeof queryOneFresh
  getTransactionFailureStage: typeof getTransactionFailureStage
}

interface ExistingExecutionRow {
  state: string
  result_reference: string | null
  route_or_tool: string
  request_digest: string | null
}

interface ReconciledExecutionRow extends ExistingExecutionRow, BannerAssetUploadResult {}

interface Coordination {
  db: TransactionDb
  actorUserId: string
  idempotencyKey: string
  mode: 'execute' | 'replay'
  resultReference: string | null
  mutationSettled: boolean
  savepointOpen: boolean
  newR2Key: string | null
  deleteBannerFile: typeof deleteBannerFile
  queryOneFresh: typeof queryOneFresh
  routeOrTool: string
  requestDigest: string
  finish: (terminal: GodModeAuditEventInput) => Promise<void>
}

const defaultDependencies: GodModeBannerAssetUploadDependencies = {
  transaction: transactionWithoutRetry,
  appendAudit: appendGodModeAuditEvent,
  deleteBannerFile,
  queryOneFresh,
  getTransactionFailureStage
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

async function compensateNewObject(current: Coordination): Promise<void> {
  const r2Key = current.newR2Key
  if (!r2Key) return
  await current.deleteBannerFile(r2Key)
  current.newR2Key = null
}

function recoveryRequired(): ReturnType<typeof createError> {
  return createError({
    statusCode: 503,
    statusMessage: 'Banner upload recovery required'
  })
}

async function reconcileTransactionOutcome(current: Coordination): Promise<'committed' | 'failed'> {
  let row: ReconciledExecutionRow | null
  try {
    row = await current.queryOneFresh<ReconciledExecutionRow>(
      `SELECT ledger.state, ledger.result_reference, ledger.route_or_tool,
              ledger.execution_metadata ->> 'requestDigest' AS request_digest,
              asset.id, asset.name, asset.mime_type AS "mimeType",
              asset.file_size AS "fileSize", asset.r2_key AS "r2Key", asset.url,
              asset.thumbnail_url AS "thumbnailUrl", asset.tags,
              asset.uploaded_by AS "uploadedBy", asset.created_at AS "createdAt"
         FROM god_mode_execution_ledger ledger
         LEFT JOIN banner_assets asset ON asset.id = ledger.result_reference
        WHERE ledger.actor_user_id = $1
          AND ledger.channel = 'application'
          AND ledger.idempotency_key = $2`,
      [current.actorUserId, current.idempotencyKey]
    )
  } catch {
    throw recoveryRequired()
  }

  if (!row) throw recoveryRequired()
  const exactClaim = row.route_or_tool === current.routeOrTool
    && row.request_digest === current.requestDigest
  if (!exactClaim) throw recoveryRequired()
  if (row.state === 'failed' && !row.result_reference) return 'failed'
  if (row.state !== 'succeeded'
    || !row.result_reference
    || !current.resultReference
    || row.result_reference !== current.resultReference
    || row.id !== row.result_reference
    || row.r2Key !== current.newR2Key
    || row.uploadedBy !== current.actorUserId) {
    throw recoveryRequired()
  }

  current.resultReference = row.id
  current.mutationSettled = true
  current.newR2Key = null
  return 'committed'
}

export async function prepareGodModeBannerAssetUpload(
  event: H3Event,
  dependencies: GodModeBannerAssetUploadDependencies = defaultDependencies
): Promise<{ strategy: 'transaction-bound', prepared: true, persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void> }> {
  const state = getGodModeRouteAuditState(event)
  const idempotencyKey = getHeader(event, 'idempotency-key')?.trim() || ''
  const requestDigest = getHeader(event, 'x-banner-upload-digest')?.trim() || ''
  if (!state) throw new Error('God mode route attempt is unavailable')
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw createError({
      statusCode: 428,
      statusMessage: 'A stable Idempotency-Key header is required for God mode banner asset uploads'
    })
  }
  if (!REQUEST_DIGEST.test(requestDigest)) {
    throw createError({
      statusCode: 428,
      statusMessage: 'A valid X-Banner-Upload-Digest header is required for God mode banner asset uploads'
    })
  }

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
        throw createError({ statusCode: 409, statusMessage: 'God mode banner asset upload is not safely replayable' })
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
      newR2Key: null,
      deleteBannerFile: dependencies.deleteBannerFile,
      queryOneFresh: dependencies.queryOneFresh,
      routeOrTool: state.routeOrTool,
      requestDigest,
      finish: async () => {}
    }
    ;(event.context as Record<PropertyKey, unknown>)[coordinationKey] = current
    readySettled = true
    ready.resolve(current)

    const finalEvent = await terminal.promise
    if (finalEvent.phase === 'succeeded' && (!current.mutationSettled || !current.resultReference)) {
      throw new Error('Banner asset upload did not produce a durable result')
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
        `UPDATE god_mode_execution_ledger
            SET state = $3, result_reference = $4, result_digest = $5,
                execution_phase = CASE WHEN $3 = 'succeeded' THEN 'result_captured' ELSE execution_phase END,
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

    const terminalWithEntity = current.resultReference
      ? { ...finalEvent, entityType: 'banner_asset', entityId: current.resultReference }
      : finalEvent
    await dependencies.appendAudit(terminalWithEntity, db)
  })
  transactionPromise.catch((error) => {
    if (!readySettled) ready.reject(error)
  })

  const current = await ready.promise
  current.finish = async (finalEvent) => {
    terminal.resolve(finalEvent)
    try {
      await transactionPromise
    } catch (error) {
      if (!current.newR2Key) throw error
      const failureStage = dependencies.getTransactionFailureStage(error)
      if (failureStage === 'definite_rollback') {
        await compensateNewObject(current)
        throw error
      }
      if (failureStage !== 'ambiguous_commit') throw recoveryRequired()
      const outcome = await reconcileTransactionOutcome(current)
      if (outcome === 'committed') return
      await compensateNewObject(current)
      throw error
    }
    if (finalEvent.phase !== 'succeeded') await compensateNewObject(current)
    else current.newR2Key = null
  }

  return {
    strategy: 'transaction-bound',
    prepared: true,
    persistTerminal: current.finish
  }
}

export async function executeGodModeBannerAssetUpload(
  event: H3Event,
  upload: BannerAssetUploadMutation
): Promise<BannerAssetUploadResult> {
  const current = coordination(event)
  if (!current) {
    try {
      const stored = await upload.uploadFile(upload.r2Key)
      return await upload.insertAsset(null, stored)
    } catch (error) {
      if (upload.deleteFile) await upload.deleteFile(upload.r2Key)
      throw error
    }
  }

  if (current.mode === 'replay') {
    const replay = await current.db.query(
      `SELECT id, name, mime_type AS "mimeType", file_size AS "fileSize",
              r2_key AS "r2Key", url, thumbnail_url AS "thumbnailUrl", tags,
              uploaded_by AS "uploadedBy", created_at AS "createdAt"
         FROM banner_assets
        WHERE id = $1`,
      [current.resultReference]
    )
    if (!replay.rows[0]) {
      throw createError({ statusCode: 409, statusMessage: 'Replayed banner asset no longer exists' })
    }
    current.mutationSettled = true
    return replay.rows[0] as BannerAssetUploadResult
  }

  if (upload.deleteFile) current.deleteBannerFile = upload.deleteFile
  current.newR2Key = upload.r2Key
  try {
    const stored = await upload.uploadFile(upload.r2Key)
    if (stored.key !== upload.r2Key) throw new Error('Banner asset upload returned an unexpected storage key')
    await current.db.query(`SAVEPOINT ${SAVEPOINT}`)
    current.savepointOpen = true
    const result = await upload.insertAsset(current.db, stored)
    current.resultReference = result.id
    current.mutationSettled = true
    return result
  } catch (error) {
    try {
      if (current.savepointOpen) {
        await current.db.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`)
        await current.db.query(`RELEASE SAVEPOINT ${SAVEPOINT}`)
      }
    } finally {
      current.savepointOpen = false
      await compensateNewObject(current)
    }
    throw error
  }
}

export function registerGodModeBannerAssetUploadFamily(
  dependencies: GodModeBannerAssetUploadDependencies = defaultDependencies
): () => void {
  return registerGodModeMutationFamily({
    family: 'banner-asset-upload',
    method: 'POST',
    matchesPath: path => path === ROUTE,
    prepare: event => prepareGodModeBannerAssetUpload(event, dependencies)
  })
}
