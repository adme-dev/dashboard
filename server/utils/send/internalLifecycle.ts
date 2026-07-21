import { createHash } from 'node:crypto'
import {
  queryOne as defaultQueryOne,
  queryRows as defaultQueryRows,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import { getFileMetadata, getPresignedDownloadUrl } from '~~/server/utils/storage'
import {
  FileStatusSchema,
  TransferStatusSchema,
  type WorkspaceDownloadResponse,
  type WorkspaceTransferDetail,
  type WorkspaceTransferSummary
} from '../../../shared/types/send'
import type { SendObjectMetadata } from './uploads'
import type { WorkspaceSendActor } from './workspace'

export interface InternalPublicationFile {
  id: string
  state: string
  scanStatus: string
  uploadMethod: 'single' | 'multipart'
  intentStatus: string
  intentExpiresAt: string
  expectedSize: number
  actualSize: number | null
  declaredMimeType: string
  actualMimeType: string | null
  objectEtag: string | null
}

export type InternalPublicationAssessment
  = { ready: true }
    | {
      ready: false
      code: 'EMPTY_TRANSFER' | 'FILE_INCOMPLETE' | 'OBJECT_MISMATCH' | 'UPLOAD_SEALING'
      retryAt?: string
    }

export function assessInternalPublication(
  files: readonly InternalPublicationFile[],
  now: Date
): InternalPublicationAssessment {
  if (files.length === 0) return { ready: false, code: 'EMPTY_TRANSFER' }

  let retryAt: Date | null = null
  for (const file of files) {
    if (file.state !== 'quarantined'
      || file.scanStatus !== 'not_required'
      || file.intentStatus !== 'completed') {
      return { ready: false, code: 'FILE_INCOMPLETE' }
    }
    if (!Number.isSafeInteger(file.expectedSize)
      || file.expectedSize <= 0
      || file.actualSize !== file.expectedSize
      || !file.actualMimeType
      || file.actualMimeType.trim().toLowerCase() !== file.declaredMimeType.trim().toLowerCase()
      || !file.objectEtag) {
      return { ready: false, code: 'OBJECT_MISMATCH' }
    }
    if (file.uploadMethod === 'single') {
      const expiresAt = new Date(file.intentExpiresAt)
      if (!Number.isFinite(expiresAt.getTime())) {
        return { ready: false, code: 'FILE_INCOMPLETE' }
      }
      if (expiresAt.getTime() > now.getTime()
        && (!retryAt || expiresAt.getTime() > retryAt.getTime())) {
        retryAt = expiresAt
      }
    }
  }

  return retryAt
    ? { ready: false, code: 'UPLOAD_SEALING', retryAt: retryAt.toISOString() }
    : { ready: true }
}

function isPublicationBlocked(
  assessment: InternalPublicationAssessment
): assessment is Exclude<InternalPublicationAssessment, { ready: true }> {
  return assessment.ready === false
}

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'lead', 'project_manager'])
const DOWNLOAD_TTL_SECONDS = 60
const DAY_MS = 24 * 60 * 60 * 1000
const MINIMUM_EXPIRY_EXTENSION_MS = 60 * 1000

interface QueryResultLike { rows: unknown[] }
interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

interface InternalTransferRow {
  id: string
  tenant_id: string | null
  client_id: string | null
  project_id: string | null
  owner_team_member_id: string
  status: string
  version: number | string
  title: string
  message: string | null
  max_downloads: number | string | null
  download_count: number | string
  expected_file_count: number | string
  actual_file_count: number | string
  expected_total_bytes: number | string
  actual_total_bytes: number | string
  expires_at: Date | string
  published_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

interface InternalFileRow {
  id: string
  object_key: string
  display_filename: string
  state: string
  scan_status: string
  upload_method: 'single' | 'multipart'
  intent_status: string
  intent_expires_at: Date | string
  expected_size_bytes: number | string
  actual_size_bytes: number | string | null
  declared_mime_type: string
  actual_mime_type: string | null
  object_etag: string | null
  uploaded_at: Date | string | null
}

interface DownloadRow extends InternalTransferRow {
  file_id: string
  object_key: string
  display_filename: string
  state: string
  scan_status: string
}

export type InternalSendErrorCode
  = 'NOT_FOUND'
    | 'NOT_READY'
    | 'VERSION_CONFLICT'
    | 'EXPIRED'
    | 'DOWNLOAD_LIMIT'
    | 'OBJECT_MISMATCH'
    | 'POLICY_REJECTED'
    | 'UPLOAD_SEALING'

export class InternalSendError extends Error {
  constructor(
    public readonly code: InternalSendErrorCode,
    message: string,
    public readonly retryAt?: string
  ) {
    super(message)
    this.name = 'InternalSendError'
  }
}

export interface InternalSendServiceDeps {
  queryOne: typeof defaultQueryOne
  queryRows: typeof defaultQueryRows
  transaction: typeof defaultTransaction
  getObjectMetadata(key: string): Promise<SendObjectMetadata | null>
  createDownloadUrl(key: string, expiresIn: number, fileName: string): Promise<string>
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value)
}

function idempotencyHash(actorId: string, transferId: string, operation: string, callerKey: string): string {
  return createHash('sha256')
    .update(`${actorId}\0${transferId}\0${operation}\0${callerKey}`, 'utf8')
    .digest('hex')
}

function canManage(row: InternalTransferRow, actor: WorkspaceSendActor): boolean {
  return row.owner_team_member_id === actor.id || MANAGEMENT_ROLES.has(actor.role)
}

function mapSummary(row: InternalTransferRow): WorkspaceTransferSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    projectId: row.project_id,
    status: TransferStatusSchema.parse(row.status),
    version: Number(row.version),
    title: row.title,
    message: row.message,
    passwordProtected: false,
    maxDownloads: row.max_downloads === null ? null : Number(row.max_downloads),
    fileCount: Number(row.actual_file_count),
    totalBytes: Number(row.actual_total_bytes),
    recipientCount: 0,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

function toPublicationFile(row: InternalFileRow): InternalPublicationFile {
  return {
    id: row.id,
    state: row.state,
    scanStatus: row.scan_status,
    uploadMethod: row.upload_method,
    intentStatus: row.intent_status,
    intentExpiresAt: iso(row.intent_expires_at),
    expectedSize: Number(row.expected_size_bytes),
    actualSize: row.actual_size_bytes === null ? null : Number(row.actual_size_bytes),
    declaredMimeType: row.declared_mime_type,
    actualMimeType: row.actual_mime_type,
    objectEtag: row.object_etag
  }
}

const TRANSFER_COLUMNS = `
  t.id, t.tenant_id, t.client_id, t.project_id, t.owner_team_member_id,
  t.status, t.version, t.title, t.message, t.max_downloads, t.download_count,
  t.expected_file_count, t.actual_file_count,
  t.expected_total_bytes, t.actual_total_bytes,
  t.expires_at, t.published_at, t.created_at, t.updated_at
`

const FILE_COLUMNS = `
  f.id, f.object_key, f.display_filename, f.state, f.scan_status, f.upload_method,
  i.status AS intent_status, i.expires_at AS intent_expires_at,
  f.expected_size_bytes, f.actual_size_bytes,
  f.declared_mime_type, f.actual_mime_type, f.object_etag, f.uploaded_at
`

const READ_ACCESS = `
  t.sender_class = 'workspace'
  AND (
    t.owner_team_member_id = $2
    OR $3::boolean
    OR t.client_id IS NULL
    OR EXISTS (
      SELECT 1 FROM client_team_assignments a
       WHERE a.client_id = t.client_id
         AND a.team_member_id = $2
    )
  )
`

const MANAGE_ACCESS = `
  t.sender_class = 'workspace'
  AND (t.owner_team_member_id = $2 OR $3::boolean)
`

async function defaultMetadata(key: string): Promise<SendObjectMetadata | null> {
  const metadata = await getFileMetadata(key)
  return metadata
    ? {
        key,
        size: metadata.size,
        contentType: metadata.contentType,
        etag: metadata.etag,
        uploaded: metadata.lastModified ?? null
      }
    : null
}

function errorForAssessment(assessment: Exclude<InternalPublicationAssessment, { ready: true }>): InternalSendError {
  if (assessment.code === 'UPLOAD_SEALING') {
    return new InternalSendError(
      'UPLOAD_SEALING',
      'Files are still sealing. Publish again after the upload link expires.',
      assessment.retryAt
    )
  }
  if (assessment.code === 'OBJECT_MISMATCH') {
    return new InternalSendError('OBJECT_MISMATCH', 'A file no longer matches its upload record')
  }
  return new InternalSendError('NOT_READY', assessment.code === 'EMPTY_TRANSFER'
    ? 'Add at least one file before publishing'
    : 'Every file must finish uploading before publication')
}

export function createInternalSendService(overrides: Partial<InternalSendServiceDeps> = {}) {
  const deps: InternalSendServiceDeps = {
    queryOne: overrides.queryOne ?? defaultQueryOne,
    queryRows: overrides.queryRows ?? defaultQueryRows,
    transaction: overrides.transaction ?? defaultTransaction,
    getObjectMetadata: overrides.getObjectMetadata ?? defaultMetadata,
    createDownloadUrl: overrides.createDownloadUrl
      ?? ((key, expiresIn, fileName) => getPresignedDownloadUrl(key, expiresIn, { fileName }))
  }

  async function getAuthorizedTransfer(
    transferId: string,
    actor: WorkspaceSendActor,
    manage: boolean
  ): Promise<InternalTransferRow | null> {
    return deps.queryOne<InternalTransferRow>(
      `SELECT ${TRANSFER_COLUMNS}
         FROM send_transfers t
        WHERE t.id = $1
          AND ${manage ? MANAGE_ACCESS : READ_ACCESS}`,
      [transferId, actor.id, MANAGEMENT_ROLES.has(actor.role)]
    )
  }

  return {
    async getDetail(input: {
      actor: WorkspaceSendActor
      transferId: string
      now?: Date
    }): Promise<WorkspaceTransferDetail> {
      const now = input.now ?? new Date()
      const transfer = await getAuthorizedTransfer(input.transferId, input.actor, false)
      if (!transfer) throw new InternalSendError('NOT_FOUND', 'Transfer not found')
      const rows = await deps.queryRows<InternalFileRow>(
        `SELECT ${FILE_COLUMNS}
           FROM send_files f
           JOIN send_upload_intents i
             ON i.transfer_id = f.transfer_id
            AND i.file_id = f.id
          WHERE f.transfer_id = $1
            AND f.state <> 'deleted'
          ORDER BY f.created_at, f.id`,
        [input.transferId]
      )
      const assessment = assessInternalPublication(rows.map(toPublicationFile), now)
      const effectiveStatus = ['ready', 'uploading', 'draft'].includes(transfer.status)
        && new Date(transfer.expires_at).getTime() <= now.getTime()
        ? 'expired'
        : transfer.status
      const summary = mapSummary({ ...transfer, status: effectiveStatus })
      return {
        ...summary,
        files: rows.map(row => ({
          id: row.id,
          fileName: row.display_filename,
          state: FileStatusSchema.parse(row.state),
          size: Number(row.actual_size_bytes ?? row.expected_size_bytes),
          contentType: row.actual_mime_type ?? row.declared_mime_type,
          uploadedAt: optionalIso(row.uploaded_at)
        })),
        downloadCount: Number(transfer.download_count),
        canManage: canManage(transfer, input.actor),
        canPublish: canManage(transfer, input.actor)
          && transfer.status === 'uploading'
          && assessment.ready,
        publishAvailableAt: isPublicationBlocked(assessment) && assessment.code === 'UPLOAD_SEALING'
          ? assessment.retryAt ?? null
          : null
      }
    },

    async publish(input: {
      actor: WorkspaceSendActor
      transferId: string
      expectedVersion: number
      idempotencyKey: string
      now?: Date
    }): Promise<WorkspaceTransferSummary> {
      const now = input.now ?? new Date()
      const transfer = await getAuthorizedTransfer(input.transferId, input.actor, true)
      if (!transfer) throw new InternalSendError('NOT_FOUND', 'Transfer not found')
      if (transfer.status === 'ready') return mapSummary(transfer)
      if (transfer.status !== 'uploading') throw new InternalSendError('NOT_READY', 'Transfer is not publishable')
      if (Number(transfer.version) !== input.expectedVersion) {
        throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed; refresh and try again')
      }
      if (new Date(transfer.expires_at).getTime() <= now.getTime()) {
        throw new InternalSendError('EXPIRED', 'Transfer has expired')
      }

      const files = await deps.queryRows<InternalFileRow>(
        `SELECT ${FILE_COLUMNS}
           FROM send_files f
           JOIN send_upload_intents i
             ON i.transfer_id = f.transfer_id
            AND i.file_id = f.id
          WHERE f.transfer_id = $1
            AND f.state <> 'deleted'
          ORDER BY f.created_at, f.id`,
        [input.transferId]
      )
      const assessment = assessInternalPublication(files.map(toPublicationFile), now)
      if (isPublicationBlocked(assessment)) throw errorForAssessment(assessment)

      const canonical = new Map<string, SendObjectMetadata>()
      for (const file of files) {
        const metadata = await deps.getObjectMetadata(file.object_key)
        if (!metadata
          || metadata.key !== file.object_key
          || metadata.size !== Number(file.actual_size_bytes)
          || metadata.contentType.trim().toLowerCase() !== file.actual_mime_type?.trim().toLowerCase()
          || metadata.etag !== file.object_etag) {
          throw new InternalSendError('OBJECT_MISMATCH', 'A file no longer matches its upload record')
        }
        canonical.set(file.id, metadata)
      }

      const operationKey = `publish:${idempotencyHash(
        input.actor.id,
        input.transferId,
        'publish',
        input.idempotencyKey
      )}`
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const transferResult = await db.query(
          `SELECT ${TRANSFER_COLUMNS}
             FROM send_transfers t
            WHERE t.id = $1
              AND ${MANAGE_ACCESS}
            FOR UPDATE`,
          [input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
        )
        const locked = transferResult.rows[0] as InternalTransferRow | undefined
        if (!locked) throw new InternalSendError('NOT_FOUND', 'Transfer not found')
        if (locked.status === 'ready') return mapSummary(locked)
        if (Number(locked.version) !== input.expectedVersion) {
          throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed; refresh and try again')
        }
        if (locked.status !== 'uploading') throw new InternalSendError('NOT_READY', 'Transfer is not publishable')

        const fileResult = await db.query(
          `SELECT ${FILE_COLUMNS}
             FROM send_files f
             JOIN send_upload_intents i
               ON i.transfer_id = f.transfer_id
              AND i.file_id = f.id
            WHERE f.transfer_id = $1
              AND f.state <> 'deleted'
            ORDER BY f.created_at, f.id
            FOR UPDATE OF f, i`,
          [input.transferId]
        )
        const lockedFiles = fileResult.rows as InternalFileRow[]
        const lockedAssessment = assessInternalPublication(lockedFiles.map(toPublicationFile), now)
        if (isPublicationBlocked(lockedAssessment)) throw errorForAssessment(lockedAssessment)
        for (const file of lockedFiles) {
          const metadata = canonical.get(file.id)
          if (!metadata || metadata.etag !== file.object_etag) {
            throw new InternalSendError('OBJECT_MISMATCH', 'A file changed during publication')
          }
        }

        const fileIds = lockedFiles.map(file => file.id)
        const updatedFiles = await db.query(
          `UPDATE send_files
              SET state = 'clean',
                  scan_status = 'not_required',
                  scan_provider = NULL,
                  scan_version = NULL,
                  scan_evidence = jsonb_build_object(
                    'policy', 'private_internal_v1',
                    'decision', 'not_required'
                  ),
                  updated_at = NOW()
            WHERE transfer_id = $1
              AND id = ANY($2::uuid[])
              AND state = 'quarantined'
          RETURNING id`,
          [input.transferId, fileIds]
        )
        if (updatedFiles.rows.length !== lockedFiles.length) {
          throw new InternalSendError('VERSION_CONFLICT', 'Transfer files changed during publication')
        }

        const updatedResult = await db.query(
          `UPDATE send_transfers AS t
              SET status = 'ready',
                  published_at = COALESCE(published_at, $3),
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1
              AND version = $2
              AND status = 'uploading'
          RETURNING ${TRANSFER_COLUMNS}`,
          [input.transferId, input.expectedVersion, now.toISOString()]
        )
        const updated = updatedResult.rows[0] as InternalTransferRow | undefined
        if (!updated) throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed during publication')
        await db.query(
          `INSERT INTO send_events (
             transfer_id, actor_class, actor_id, event_type, idempotency_key, metadata
           ) VALUES ($1, 'workspace_user', $2, 'published', $3, $4::jsonb)
           ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
          [
            input.transferId,
            input.actor.id,
            operationKey,
            JSON.stringify({ fileCount: lockedFiles.length, validationPolicy: 'private_internal_v1' })
          ]
        )
        return mapSummary(updated)
      })
    },

    async createDownload(input: {
      actor: WorkspaceSendActor
      transferId: string
      fileId: string
      idempotencyKey: string
      now?: Date
    }): Promise<WorkspaceDownloadResponse> {
      const now = input.now ?? new Date()
      const operationKey = `download:${idempotencyHash(
        input.actor.id,
        input.transferId,
        input.fileId,
        input.idempotencyKey
      )}`
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const result = await db.query(
          `SELECT ${TRANSFER_COLUMNS},
                  f.id AS file_id, f.object_key, f.display_filename,
                  f.state, f.scan_status
             FROM send_transfers t
             JOIN send_files f ON f.transfer_id = t.id
            WHERE t.id = $1
              AND f.id = $4
              AND ${READ_ACCESS}
            FOR UPDATE OF t`,
          [input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role), input.fileId]
        )
        const row = result.rows[0] as DownloadRow | undefined
        if (!row) throw new InternalSendError('NOT_FOUND', 'Transfer not found')
        if (row.status !== 'ready' || row.state !== 'clean'
          || !['not_required', 'clean'].includes(row.scan_status)) {
          throw new InternalSendError('NOT_READY', 'File is not available')
        }
        if (new Date(row.expires_at).getTime() <= now.getTime()) {
          throw new InternalSendError('EXPIRED', 'Transfer has expired')
        }

        const existing = await db.query(
          `SELECT 1 FROM send_events
            WHERE transfer_id = $1 AND idempotency_key = $2
            LIMIT 1`,
          [input.transferId, operationKey]
        )
        if (!existing.rows[0]
          && row.max_downloads !== null
          && Number(row.download_count) >= Number(row.max_downloads)) {
          throw new InternalSendError('DOWNLOAD_LIMIT', 'Transfer download limit reached')
        }
        const url = await deps.createDownloadUrl(
          row.object_key,
          DOWNLOAD_TTL_SECONDS,
          row.display_filename
        )
        if (!existing.rows[0]) {
          await db.query(
            `UPDATE send_transfers
                SET download_count = download_count + 1,
                    updated_at = NOW()
              WHERE id = $1`,
            [input.transferId]
          )
          await db.query(
            `INSERT INTO send_events (
               transfer_id, file_id, actor_class, actor_id, event_type,
               idempotency_key, metadata
             ) VALUES ($1, $2, 'workspace_user', $3, 'downloaded', $4, $5::jsonb)
             ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
            [input.transferId, input.fileId, input.actor.id, operationKey, JSON.stringify({ fileId: input.fileId })]
          )
        }
        return {
          url,
          expiresAt: new Date(now.getTime() + DOWNLOAD_TTL_SECONDS * 1000).toISOString()
        }
      })
    },

    async extendExpiry(input: {
      actor: WorkspaceSendActor
      transferId: string
      expiresAt: string
      expectedVersion: number
      idempotencyKey: string
      maxRetentionDays: number
      now?: Date
    }): Promise<WorkspaceTransferSummary> {
      const now = input.now ?? new Date()
      const operationKey = `expiry:${idempotencyHash(
        input.actor.id,
        input.transferId,
        'expiry',
        input.idempotencyKey
      )}`
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const currentResult = await db.query(
          `SELECT ${TRANSFER_COLUMNS}
             FROM send_transfers t
            WHERE t.id = $1
              AND ${MANAGE_ACCESS}
            FOR UPDATE`,
          [input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
        )
        const current = currentResult.rows[0] as InternalTransferRow | undefined
        if (!current) throw new InternalSendError('NOT_FOUND', 'Transfer not found')

        const replay = await db.query(
          `SELECT 1 FROM send_events
            WHERE transfer_id = $1
              AND idempotency_key = $2
              AND event_type = 'operator_action'
            LIMIT 1`,
          [input.transferId, operationKey]
        )
        if (replay.rows[0]) return mapSummary(current)

        if (!['draft', 'uploading', 'ready'].includes(current.status)) {
          throw new InternalSendError('NOT_READY', 'Transfer expiry cannot be extended')
        }
        if (Number(current.version) !== input.expectedVersion) {
          throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed; refresh and try again')
        }

        const currentExpiry = new Date(current.expires_at)
        if (!Number.isFinite(currentExpiry.getTime()) || currentExpiry.getTime() <= now.getTime()) {
          throw new InternalSendError('EXPIRED', 'Transfer has expired')
        }
        const requestedExpiry = new Date(input.expiresAt)
        if (!Number.isFinite(requestedExpiry.getTime())
          || requestedExpiry.getTime() - currentExpiry.getTime() < MINIMUM_EXPIRY_EXTENSION_MS) {
          throw new InternalSendError('POLICY_REJECTED', 'New expiry must be at least one minute later')
        }
        if (!Number.isSafeInteger(input.maxRetentionDays) || input.maxRetentionDays <= 0) {
          throw new InternalSendError('POLICY_REJECTED', 'Transfer retention policy is invalid')
        }
        const createdAt = new Date(current.created_at)
        const maximumExpiryMs = createdAt.getTime() + input.maxRetentionDays * DAY_MS
        if (!Number.isFinite(createdAt.getTime())
          || !Number.isSafeInteger(maximumExpiryMs)
          || requestedExpiry.getTime() > maximumExpiryMs) {
          throw new InternalSendError('POLICY_REJECTED', 'Transfer exceeds retention limit')
        }

        const updatedResult = await db.query(
          `UPDATE send_transfers AS t
              SET expires_at = $3,
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1
              AND version = $2
          RETURNING ${TRANSFER_COLUMNS}`,
          [input.transferId, input.expectedVersion, requestedExpiry.toISOString()]
        )
        const updated = updatedResult.rows[0] as InternalTransferRow | undefined
        if (!updated) throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed during expiry extension')

        await db.query(
          `INSERT INTO send_events (
             transfer_id, actor_class, actor_id, event_type, idempotency_key, metadata
           ) VALUES ($1, 'workspace_user', $2, 'operator_action', $3, $4::jsonb)
           ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
          [
            input.transferId,
            input.actor.id,
            operationKey,
            JSON.stringify({
              action: 'expiry_extended',
              previousExpiresAt: currentExpiry.toISOString(),
              expiresAt: requestedExpiry.toISOString(),
              maxRetentionDays: input.maxRetentionDays
            })
          ]
        )
        return mapSummary(updated)
      })
    },

    async revoke(input: {
      actor: WorkspaceSendActor
      transferId: string
      expectedVersion: number
      idempotencyKey: string
      now?: Date
    }): Promise<WorkspaceTransferSummary> {
      const now = input.now ?? new Date()
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const currentResult = await db.query(
          `SELECT ${TRANSFER_COLUMNS}
             FROM send_transfers t
            WHERE t.id = $1
              AND ${MANAGE_ACCESS}
            FOR UPDATE`,
          [input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
        )
        const current = currentResult.rows[0] as InternalTransferRow | undefined
        if (!current) throw new InternalSendError('NOT_FOUND', 'Transfer not found')
        if (current.status === 'revoked') return mapSummary(current)
        if (!['draft', 'uploading', 'ready'].includes(current.status)) {
          throw new InternalSendError('NOT_READY', 'Transfer cannot be revoked')
        }
        if (Number(current.version) !== input.expectedVersion) {
          throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed; refresh and try again')
        }
        const updatedResult = await db.query(
          `UPDATE send_transfers AS t
              SET status = 'revoked',
                  revoked_at = COALESCE(revoked_at, $3),
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1 AND version = $2
          RETURNING ${TRANSFER_COLUMNS}`,
          [input.transferId, input.expectedVersion, now.toISOString()]
        )
        const updated = updatedResult.rows[0] as InternalTransferRow | undefined
        if (!updated) throw new InternalSendError('VERSION_CONFLICT', 'Transfer changed during revocation')
        await db.query(
          `INSERT INTO send_events (
             transfer_id, actor_class, actor_id, event_type, idempotency_key, metadata
           ) VALUES ($1, 'workspace_user', $2, 'revoked', $3, '{}'::jsonb)
           ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
          [
            input.transferId,
            input.actor.id,
            `revoke:${idempotencyHash(input.actor.id, input.transferId, 'revoke', input.idempotencyKey)}`
          ]
        )
        return mapSummary(updated)
      })
    }
  }
}

export function toInternalSendHttpError(error: unknown): unknown {
  if (!(error instanceof InternalSendError)) return error
  const statusCode = {
    NOT_FOUND: 404,
    NOT_READY: 409,
    VERSION_CONFLICT: 409,
    EXPIRED: 410,
    DOWNLOAD_LIMIT: 429,
    OBJECT_MISMATCH: 409,
    POLICY_REJECTED: 422,
    UPLOAD_SEALING: 409
  }[error.code]
  return createError({
    statusCode,
    statusMessage: error.retryAt ? `${error.message} Retry after ${error.retryAt}.` : error.message
  })
}
