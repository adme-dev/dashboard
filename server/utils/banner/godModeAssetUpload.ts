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
const UUID_TEXT = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
const UUID = new RegExp(UUID_TEXT, 'i')
const EXECUTION_SQL = `SELECT state, result_reference, route_or_tool, correlation_id, execution_phase, execution_metadata ->> 'requestDigest' AS request_digest, execution_metadata ->> 'r2Key' AS r2_key, execution_metadata ->> 'assetId' AS asset_id, updated_at < NOW() - INTERVAL '2 minutes' AS claim_stale FROM god_mode_execution_ledger WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2`
const ASSET_SQL = `SELECT id, name, mime_type AS "mimeType", file_size AS "fileSize", r2_key AS "r2Key", url, thumbnail_url AS "thumbnailUrl", tags, uploaded_by AS "uploadedBy", created_at AS "createdAt" FROM banner_assets WHERE id = CASE WHEN $1 ~* '${UUID_TEXT}' THEN $1::uuid ELSE NULL END`
const TERMINAL_SQL = `SELECT phase AS terminal_phase FROM god_mode_audit_events WHERE correlation_id = $1::uuid AND phase IN ('succeeded', 'failed')`
const CLAIM_OWNERSHIP_LOST = new Error('Banner upload claim ownership changed')

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

interface BannerUploadStorageIdentity {
  assetId: string
  r2Key: string
}

export interface BannerAssetUploadMutation {
  assetId: string
  r2Key: string
  /** Deterministic response and insert identity, constructed before native storage work. */
  result: (stored: StoredBannerAssetUpload, identity: BannerUploadStorageIdentity) => BannerAssetUploadResult
  uploadFile: (r2Key: string, assetId?: string) => Promise<StoredBannerAssetUpload>
  deleteFile?: (r2Key: string) => Promise<void>
  reconcileAsset?: (assetId: string) => Promise<BannerAssetUploadResult | null>
  insertAsset: (
    db: TransactionDb | null,
    stored: StoredBannerAssetUpload,
    result?: BannerAssetUploadResult
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
  correlation_id?: string | null
  execution_phase?: string | null
  claim_stale?: boolean
  r2_key?: string | null
  asset_id?: string | null
}

interface ReconciledExecutionRow extends ExistingExecutionRow, Partial<BannerAssetUploadResult> {
  terminal_phase?: 'succeeded' | 'failed' | null
}

interface PendingUpload {
  stored: StoredBannerAssetUpload
  result: BannerAssetUploadResult
  insertAsset: BannerAssetUploadMutation['insertAsset']
}

interface Coordination {
  actorUserId: string
  correlationId: string
  idempotencyKey: string
  mode: 'execute' | 'replay' | 'wait'
  resultReference: string | null
  newR2Key: string | null
  pending: PendingUpload | null
  reserved: BannerUploadStorageIdentity | null
  deleteBannerFile: typeof deleteBannerFile
  queryOneFresh: typeof queryOneFresh
  transaction: typeof transactionWithoutRetry
  routeOrTool: string
  requestDigest: string
}

const defaultDependencies: GodModeBannerAssetUploadDependencies = {
  transaction: transactionWithoutRetry,
  appendAudit: appendGodModeAuditEvent,
  deleteBannerFile,
  queryOneFresh,
  getTransactionFailureStage
}

function transactionFailureStage(
  dependencies: GodModeBannerAssetUploadDependencies,
  error: unknown
) {
  return typeof dependencies.getTransactionFailureStage === 'function'
    ? dependencies.getTransactionFailureStage(error)
    : getTransactionFailureStage(error)
}

function coordination(event: H3Event): Coordination | null {
  return ((event.context as Record<PropertyKey, unknown>)[coordinationKey] as Coordination | undefined) ?? null
}

function recoveryRequired(): ReturnType<typeof createError> {
  return createError({
    statusCode: 503,
    statusMessage: 'Banner upload recovery required'
  })
}

function conflict(message: string): ReturnType<typeof createError> {
  return createError({ statusCode: 409, statusMessage: message })
}

function exactExecution(row: ExistingExecutionRow, routeOrTool: string, requestDigest: string): void {
  if (row.route_or_tool !== routeOrTool) {
    throw conflict('Idempotency key belongs to another operation')
  }
  if (row.request_digest !== requestDigest) {
    throw conflict('Idempotency key request does not match')
  }
}

function hasAsciiControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function durableAssetIdentity(row: ExistingExecutionRow): BannerUploadStorageIdentity | null {
  if (typeof row.asset_id !== 'string' || !UUID.test(row.asset_id)) return null
  if (typeof row.r2_key !== 'string'
    || row.r2_key.length < 1
    || row.r2_key.length > 1024
    || !row.r2_key.startsWith('banner-assets/')
    || hasAsciiControlCharacter(row.r2_key)) return null
  return { assetId: row.asset_id, r2Key: row.r2_key }
}

function exactAssetResult(
  candidate: BannerAssetUploadResult,
  expected: BannerAssetUploadResult
): boolean {
  return candidate.id === expected.id
    && candidate.r2Key === expected.r2Key
    && candidate.uploadedBy === expected.uploadedBy
    && candidate.name === expected.name
    && candidate.mimeType === expected.mimeType
    && candidate.fileSize === expected.fileSize
    && candidate.url === expected.url
}

async function reconcileOrdinaryAsset(
  upload: BannerAssetUploadMutation,
  expected: BannerAssetUploadResult
): Promise<BannerAssetUploadResult | null> {
  let durable: BannerAssetUploadResult | null
  try {
    durable = upload.reconcileAsset
      ? await upload.reconcileAsset(expected.id)
      : await queryOneFresh<BannerAssetUploadResult>(ASSET_SQL, [expected.id])
  } catch {
    throw recoveryRequired()
  }
  if (durable && !exactAssetResult(durable, expected)) throw recoveryRequired()
  return durable
}

function executionMode(
  row: ExistingExecutionRow,
  correlationId: string,
  routeOrTool: string,
  requestDigest: string
): { mode: Coordination['mode'], resultReference: string | null } {
  exactExecution(row, routeOrTool, requestDigest)
  if (row.state === 'succeeded' && row.result_reference) {
    return { mode: 'replay', resultReference: row.result_reference }
  }
  if (row.state === 'in_progress' && row.correlation_id === correlationId) {
    return { mode: 'execute', resultReference: null }
  }
  if (row.state === 'in_progress') return { mode: 'wait', resultReference: null }
  throw conflict('God mode banner asset upload is not safely replayable')
}

async function waitForReplay(current: Coordination): Promise<BannerAssetUploadResult> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const row = await current.queryOneFresh<ExistingExecutionRow>(EXECUTION_SQL, [current.actorUserId, current.idempotencyKey])
    if (!row) throw recoveryRequired()
    exactExecution(row, current.routeOrTool, current.requestDigest)
    if (row.state === 'failed') {
      throw conflict('God mode banner asset upload is not safely replayable')
    }
    if (row.state === 'succeeded' && row.result_reference) {
      const asset = await current.queryOneFresh<BannerAssetUploadResult>(ASSET_SQL, [row.result_reference])
      if (!asset || asset.id !== row.result_reference) throw recoveryRequired()
      current.mode = 'replay'
      current.resultReference = row.result_reference
      return asset
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw conflict('God mode banner asset upload is still in progress')
}

async function reserveStorage(
  current: Coordination,
  identity: BannerUploadStorageIdentity
): Promise<'execute' | 'replay'> {
  const outcome = await current.transaction(async (db) => {
    const locked = await db.query(`${EXECUTION_SQL} FOR UPDATE`, [current.actorUserId, current.idempotencyKey])
    const row = locked.rows[0] as ExistingExecutionRow | undefined
    if (!row) throw recoveryRequired()
    exactExecution(row, current.routeOrTool, current.requestDigest)
    if (row.state === 'succeeded' && row.result_reference) {
      current.resultReference = row.result_reference
      return 'replay' as const
    }
    if (row.state !== 'in_progress' || row.correlation_id !== current.correlationId) {
      return 'replay' as const
    }
    const persistedIdentity = durableAssetIdentity(row)
    if (row.execution_phase === 'dispatched') {
      if (!persistedIdentity || !current.reserved
        || persistedIdentity.assetId !== current.reserved.assetId
        || persistedIdentity.r2Key !== current.reserved.r2Key) throw recoveryRequired()
      return 'execute' as const
    }
    // execution_phase is NOT NULL in migrated schemas; accepting an omitted
    // value keeps injected/test adapters compatible with the legacy row shape.
    if (row.execution_phase && row.execution_phase !== 'claimed') throw recoveryRequired()
    const reserved = await db.query(
      `UPDATE god_mode_execution_ledger SET execution_phase = 'dispatched', execution_metadata = execution_metadata || jsonb_build_object('r2Key', $4::TEXT, 'assetId', $5::TEXT), updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2 AND correlation_id = $3 AND state = 'in_progress' AND execution_phase = 'claimed' RETURNING state`,
      [current.actorUserId, current.idempotencyKey, current.correlationId, identity.r2Key, identity.assetId]
    )
    if (!reserved.rows[0]) throw recoveryRequired()
    current.reserved = identity
    return 'execute' as const
  })
  if (outcome === 'replay') current.mode = 'wait'
  return outcome
}

async function compensateNewObject(current: Coordination): Promise<void> {
  const r2Key = current.newR2Key
  if (!r2Key) return
  await current.deleteBannerFile(r2Key)
  current.newR2Key = null
}

async function reconcileClaim(
  current: Pick<Coordination, 'actorUserId' | 'correlationId' | 'idempotencyKey' | 'routeOrTool' | 'requestDigest'>,
  dependencies: GodModeBannerAssetUploadDependencies
): Promise<{
  mode: Coordination['mode']
  resultReference: string | null
  reserved?: BannerUploadStorageIdentity | null
}> {
  let row: ExistingExecutionRow | null
  try {
    row = await dependencies.queryOneFresh<ExistingExecutionRow>(EXECUTION_SQL, [current.actorUserId, current.idempotencyKey])
  } catch {
    throw recoveryRequired()
  }
  if (!row) throw recoveryRequired()
  const admitted = executionMode(row, current.correlationId, current.routeOrTool, current.requestDigest)
  if (admitted.mode !== 'execute') return admitted
  if (row.execution_phase === 'claimed') return admitted
  const reservedIdentity = durableAssetIdentity(row)
  if (row.execution_phase !== 'dispatched' || !reservedIdentity) throw recoveryRequired()
  return {
    ...admitted,
    reserved: reservedIdentity
  }
}

async function reconcileTransactionOutcome(
  current: Coordination,
  expectedPhase: 'succeeded' | 'failed',
  dependencies: GodModeBannerAssetUploadDependencies
): Promise<'committed' | 'failed'> {
  let row: ExistingExecutionRow | null
  let terminal: Pick<ReconciledExecutionRow, 'terminal_phase'> | null
  let asset: ReconciledExecutionRow | null = null
  try {
    row = await dependencies.queryOneFresh<ExistingExecutionRow>(EXECUTION_SQL, [current.actorUserId, current.idempotencyKey])
    terminal = await dependencies.queryOneFresh(TERMINAL_SQL, [current.correlationId])
    if (row?.result_reference) asset = await dependencies.queryOneFresh<ReconciledExecutionRow>(ASSET_SQL, [row.result_reference])
  } catch {
    throw recoveryRequired()
  }

  if (!row) throw recoveryRequired()
  exactExecution(row, current.routeOrTool, current.requestDigest)
  if (row.state === 'failed' && !row.result_reference && terminal?.terminal_phase === 'failed') return 'failed'
  if (expectedPhase !== 'succeeded'
    || row.state !== 'succeeded'
    || terminal?.terminal_phase !== 'succeeded'
    || !row.result_reference
    || !current.resultReference
    || row.result_reference !== current.resultReference
    || !asset
    || asset.id !== row.result_reference
    || asset.r2Key !== current.newR2Key
    || asset.uploadedBy !== current.actorUserId) {
    throw recoveryRequired()
  }

  current.newR2Key = null
  return 'committed'
}

async function appendFailureAfterRollback(
  current: Coordination,
  terminal: GodModeAuditEventInput,
  dependencies: GodModeBannerAssetUploadDependencies
): Promise<void> {
  const failureTerminal: GodModeAuditEventInput = {
    ...terminal,
    phase: 'failed',
    outcomeCode: 'terminal_finalization_failed'
  }
  await dependencies.transaction(async (db) => {
    await db.query(
      `UPDATE god_mode_execution_ledger SET state = 'failed', result_reference = NULL, result_digest = NULL, updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2 AND correlation_id = $3 AND state = 'in_progress'`,
      [current.actorUserId, current.idempotencyKey, current.correlationId]
    )
    await dependencies.appendAudit(failureTerminal, db)
  })
}

async function persistTerminal(
  current: Coordination,
  terminal: GodModeAuditEventInput,
  dependencies: GodModeBannerAssetUploadDependencies
): Promise<void> {
  const expectedPhase = terminal.phase === 'succeeded' ? 'succeeded' : 'failed'
  try {
    await dependencies.transaction(async (db) => {
      const locked = await db.query(`${EXECUTION_SQL} FOR UPDATE`, [current.actorUserId, current.idempotencyKey])
      const row = locked.rows[0] as ExistingExecutionRow | undefined
      if (!row) throw recoveryRequired()
      exactExecution(row, current.routeOrTool, current.requestDigest)

      if (current.mode === 'wait') {
        await dependencies.appendAudit(terminal, db)
        return
      }
      if (current.mode === 'replay') {
        if (row.state !== 'succeeded' || row.result_reference !== current.resultReference) {
          throw conflict('God mode banner asset upload is not safely replayable')
        }
        await dependencies.appendAudit(terminal, db)
        return
      }

      if (row.state !== 'in_progress' || row.correlation_id !== current.correlationId) {
        throw CLAIM_OWNERSHIP_LOST
      }

      if (expectedPhase === 'succeeded') {
        if (!current.resultReference || !current.pending) {
          throw new Error('Banner asset upload did not produce a durable result')
        }
        const inserted = await current.pending.insertAsset(db, current.pending.stored, current.pending.result)
        if (inserted.id !== current.pending.result.id
          || inserted.r2Key !== current.pending.stored.key
          || inserted.uploadedBy !== current.actorUserId) {
          throw new Error('Banner asset insert returned an unexpected result')
        }
        const resultDigest = createHash('sha256').update(current.resultReference).digest('hex')
        await db.query(
          `UPDATE god_mode_execution_ledger SET state = 'succeeded', result_reference = $4, result_digest = $5, execution_phase = 'result_captured', updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2 AND correlation_id = $3 AND state = 'in_progress'`,
          [current.actorUserId, current.idempotencyKey, current.correlationId, current.resultReference, resultDigest]
        )
      } else {
        await db.query(
          `UPDATE god_mode_execution_ledger SET state = 'failed', result_reference = NULL, result_digest = NULL, updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2 AND correlation_id = $3 AND state = 'in_progress'`,
          [current.actorUserId, current.idempotencyKey, current.correlationId]
        )
      }
      // Terminal identity must remain byte-for-byte aligned with the immutable attempt.
      // The created asset is linked only through ledger.result_reference.
      await dependencies.appendAudit(terminal, db)
    })
  } catch (error) {
    if (error === CLAIM_OWNERSHIP_LOST) {
      // A stale-lease takeover now owns this exact durable R2 identity. The
      // superseded request must not delete the shared object during cleanup.
      current.newR2Key = null
      throw recoveryRequired()
    }
    const failureStage = transactionFailureStage(dependencies, error)
    if (failureStage === 'ambiguous_commit') {
      const outcome = await reconcileTransactionOutcome(current, expectedPhase, dependencies)
      if (outcome === 'committed') return
      await compensateNewObject(current)
      if (expectedPhase === 'failed') return
      throw error
    }
    if (failureStage !== 'definite_rollback') throw error

    if (expectedPhase === 'succeeded') await compensateNewObject(current)
    await appendFailureAfterRollback(current, terminal, dependencies)
    throw error
  }

  if (expectedPhase === 'succeeded') {
    current.newR2Key = null
  } else {
    await compensateNewObject(current)
  }
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

  const identity = {
    actorUserId: state.actorUserId,
    correlationId: state.correlationId,
    idempotencyKey,
    routeOrTool: state.routeOrTool,
    requestDigest
  }
  let admission: {
    mode: Coordination['mode']
    resultReference: string | null
    reserved?: BannerUploadStorageIdentity | null
  }
  try {
    admission = await dependencies.transaction(async (db) => {
      const claimed = await db.query(
        `INSERT INTO god_mode_execution_ledger (actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool, executor_class, session_digest, execution_phase, execution_metadata) VALUES ($1, 'application', $2, 'in_progress', $3, $4, 'local-transactional', $5, 'claimed', jsonb_build_object('requestDigest', $6::TEXT)) ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING RETURNING state`,
        [state.actorUserId, idempotencyKey, state.correlationId, state.routeOrTool, state.sessionDigest, requestDigest]
      )
      if (claimed.rows[0]) return { mode: 'execute' as const, resultReference: null }

      const existing = await db.query(`${EXECUTION_SQL} FOR UPDATE`, [state.actorUserId, idempotencyKey])
      const row = existing.rows[0] as ExistingExecutionRow | undefined
      if (!row) throw recoveryRequired()
      exactExecution(row, state.routeOrTool, requestDigest)
      const reservedIdentity = durableAssetIdentity(row)
      const reclaimablePhase = row.execution_phase === 'claimed'
        || (row.execution_phase === 'dispatched' && reservedIdentity !== null)
      if (row.state === 'in_progress'
        && row.correlation_id !== state.correlationId
        && reclaimablePhase
        && row.claim_stale === true) {
        const previousCorrelationId = row.correlation_id
        const closedAttempt = await db.query(
          `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, tenant_id, client_id, entity_type, entity_id, bypassed_controls, outcome_code, emergency_disabled) SELECT attempt.actor_user_id, attempt.correlation_id, attempt.session_digest, attempt.channel, attempt.route_or_tool, 'failed', attempt.tenant_id, attempt.client_id, attempt.entity_type, attempt.entity_id, god_mode_normalize_bypassed_controls(attempt.bypassed_controls || COALESCE((SELECT array_agg(control.value) FROM god_mode_audit_events bypass CROSS JOIN LATERAL unnest(bypass.bypassed_controls) AS control(value) WHERE bypass.correlation_id = attempt.correlation_id AND bypass.phase = 'bypass'), ARRAY[]::VARCHAR[])), 'claim_lease_expired', attempt.emergency_disabled FROM god_mode_audit_events attempt WHERE attempt.correlation_id = $1::uuid AND attempt.phase = 'attempt' ON CONFLICT DO NOTHING RETURNING id`,
          [previousCorrelationId]
        )
        if (!closedAttempt.rows[0]) throw recoveryRequired()
        const reclaimed = await db.query(
          `UPDATE god_mode_execution_ledger SET correlation_id = $3, session_digest = $4, execution_phase = $7, execution_metadata = CASE WHEN $7 = 'claimed' THEN jsonb_build_object('requestDigest', $5::TEXT) ELSE execution_metadata END, updated_at = NOW() WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2 AND correlation_id = $6 AND state = 'in_progress' AND execution_phase = $7 AND updated_at < NOW() - INTERVAL '2 minutes' RETURNING state`,
          [
            state.actorUserId,
            idempotencyKey,
            state.correlationId,
            state.sessionDigest,
            requestDigest,
            previousCorrelationId,
            row.execution_phase
          ]
        )
        if (!reclaimed.rows[0]) throw recoveryRequired()
        return {
          mode: 'execute' as const,
          resultReference: null,
          reserved: reservedIdentity
        }
      }
      return executionMode(row, state.correlationId, state.routeOrTool, requestDigest)
    })
  } catch (error) {
    if (transactionFailureStage(dependencies, error) !== 'ambiguous_commit') throw error
    admission = await reconcileClaim(identity, dependencies)
  }

  const current: Coordination = {
    ...identity,
    mode: admission.mode,
    resultReference: admission.resultReference,
    newR2Key: null,
    pending: null,
    reserved: admission.reserved ?? null,
    deleteBannerFile: dependencies.deleteBannerFile,
    queryOneFresh: dependencies.queryOneFresh,
    transaction: dependencies.transaction
  }
  ;(event.context as Record<PropertyKey, unknown>)[coordinationKey] = current

  return {
    strategy: 'transaction-bound',
    prepared: true,
    persistTerminal: async terminal => await persistTerminal(current, terminal, dependencies)
  }
}

export async function executeGodModeBannerAssetUpload(
  event: H3Event,
  upload: BannerAssetUploadMutation
): Promise<BannerAssetUploadResult> {
  const current = coordination(event)
  if (!current) {
    let stored: StoredBannerAssetUpload
    try {
      stored = await upload.uploadFile(upload.r2Key, upload.assetId)
    } catch (error) {
      if (upload.deleteFile) await upload.deleteFile(upload.r2Key)
      throw error
    }
    let expected: BannerAssetUploadResult
    try {
      expected = upload.result(stored, {
        assetId: upload.assetId,
        r2Key: upload.r2Key
      })
    } catch (error) {
      if (upload.deleteFile) await upload.deleteFile(upload.r2Key)
      throw error
    }
    try {
      const inserted = await upload.insertAsset(null, stored, expected)
      if (!exactAssetResult(inserted, expected)) throw recoveryRequired()
      return inserted
    } catch (error) {
      const durable = await reconcileOrdinaryAsset(upload, expected)
      if (durable) return durable
      if (upload.deleteFile) await upload.deleteFile(upload.r2Key)
      throw error
    }
  }

  if (current.mode === 'replay') {
    const replay = await current.queryOneFresh<BannerAssetUploadResult>(ASSET_SQL, [current.resultReference])
    if (!replay) {
      throw conflict('Replayed banner asset no longer exists')
    }
    return replay
  }

  if (current.mode === 'wait') return await waitForReplay(current)

  const candidateAssetId = upload.assetId
  if (!candidateAssetId || !UUID.test(candidateAssetId)) {
    throw new Error('God mode banner asset upload requires a valid deterministic asset id')
  }
  const identity: BannerUploadStorageIdentity = current.reserved ?? { assetId: candidateAssetId, r2Key: upload.r2Key }
  if (await reserveStorage(current, identity) === 'replay') return await waitForReplay(current)
  if (upload.deleteFile) current.deleteBannerFile = upload.deleteFile
  current.newR2Key = identity.r2Key
  try {
    const stored = await upload.uploadFile(identity.r2Key, identity.assetId)
    const result = upload.result(stored, identity)
    if (result.id !== identity.assetId
      || result.r2Key !== identity.r2Key
      || result.uploadedBy !== current.actorUserId) {
      throw new Error('God mode banner asset upload identity does not match its claim')
    }
    if (stored.key !== identity.r2Key
      || stored.key !== result.r2Key
      || stored.url !== result.url
      || stored.size !== result.fileSize) {
      throw new Error('Banner asset upload returned an unexpected storage result')
    }
    current.resultReference = result.id
    current.pending = { stored, result, insertAsset: upload.insertAsset }
    return result
  } catch (error) {
    // The durable dispatched claim may have been reclaimed while native R2
    // work was in flight. Cleanup is deferred to failed terminal persistence,
    // which locks the ledger and proves this correlation still owns the claim.
    current.pending = null
    current.resultReference = null
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
