import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  queryOne as defaultQueryOne,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import {
  getFileMetadata,
  getPresignedUploadUrl
} from '~~/server/utils/storage'
import {
  FileStatusSchema,
  type FileDeclaration,
  type WorkspaceMultipartPartResponse,
  type WorkspaceMultipartResumeResponse,
  type WorkspaceUploadedFile,
  type WorkspaceUploadIntentResponse
} from '../../../shared/types/send'
import type { WorkspaceSendActor } from './workspace'
import {
  expectedMultipartPartSize,
  resolveMultipartGeometry,
  type MultipartGeometry
} from './multipart'
import {
  abortMultipartObject,
  completeMultipartObject,
  createMultipartObject,
  getPresignedMultipartPartUrl,
  isMultipartUploadMissing,
  listMultipartObjectParts,
  type MultipartStoragePart
} from './multipartStorage'

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'lead', 'project_manager'])

interface QueryResultLike { rows: unknown[] }
interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

interface TransferUploadRow {
  id: string
  status: string
  configured_max_bytes: number | string
  configured_max_files: number | string
  expected_total_bytes: number | string
  expected_file_count: number | string
  expires_at: Date | string
  policy_snapshot: unknown
}

interface UploadIntentRow {
  id: string
  transfer_id: string
  file_id: string
  uploader_id: string
  object_key: string
  expected_size_bytes: number | string
  expected_mime_type: string
  original_filename: string
  display_filename: string
  status: string
  file_state: string
  capability_nonce_hash: string
  expires_at: Date | string
  completed_at: Date | string | null
  actual_size_bytes: number | string | null
  actual_mime_type: string | null
  object_etag: string | null
  uploaded_at: Date | string | null
  upload_method: 'single' | 'multipart'
  multipart_upload_id: string | null
  multipart_part_size_bytes: number | string | null
}

export interface SendObjectMetadata {
  key: string
  size: number
  contentType: string
  etag: string | null
  uploaded: Date | null
}

export type WorkspaceSendUploadErrorCode
  = | 'NOT_FOUND'
    | 'POLICY_REJECTED'
    | 'TRANSFER_UNAVAILABLE'
    | 'INTENT_EXPIRED'
    | 'INTENT_UNAVAILABLE'
    | 'CAPABILITY_INVALID'
    | 'OBJECT_NOT_FOUND'
    | 'OBJECT_MISMATCH'
    | 'MULTIPART_REQUIRED'
    | 'MULTIPART_INVALID_PART'
    | 'MULTIPART_MISMATCH'
    | 'STORAGE_UNAVAILABLE'

export class WorkspaceSendUploadError extends Error {
  constructor(public readonly code: WorkspaceSendUploadErrorCode, message: string) {
    super(message)
    this.name = 'WorkspaceSendUploadError'
  }
}

export interface WorkspaceSendUploadServiceDeps {
  queryOne: typeof defaultQueryOne
  transaction: typeof defaultTransaction
  createId(): string
  createCapability(): string
  hashCapability(value: string): string
  createUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>
  getObjectMetadata(key: string): Promise<SendObjectMetadata | null>
  createMultipartUpload(key: string, contentType: string): Promise<string>
  createMultipartPartUrl(input: {
    key: string
    uploadId: string
    partNumber: number
    expiresIn: number
  }): Promise<string>
  listMultipartParts(input: { key: string, uploadId: string }): Promise<MultipartStoragePart[]>
  completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: MultipartStoragePart[]
  }): Promise<void>
  abortMultipartUpload(input: { key: string, uploadId: string }): Promise<void>
}

const INTENT_COLUMNS = `
  i.id, i.transfer_id, i.file_id, i.uploader_id, i.object_key,
  i.expected_size_bytes, i.expected_mime_type, i.status,
  i.capability_nonce_hash, i.expires_at, i.completed_at,
  f.original_filename, f.display_filename, f.state AS file_state,
  f.actual_size_bytes, f.actual_mime_type, f.object_etag, f.uploaded_at,
  i.upload_method, i.multipart_upload_id, i.multipart_part_size_bytes
`

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function secureHashMatches(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function canonicalFilename(fileName: string): string {
  const leaf = fileName.normalize('NFKC').split(/[\\/]/).pop() || 'file'
  const cleaned = leaf.replace(/\p{C}/gu, '').trim()
  return [...(cleaned || 'file')].slice(0, 255).join('')
}

function maxFileBytes(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>).maxFileBytes
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function scopedIdempotencyKey(actorId: string, transferId: string, callerKey: string): string {
  return sha256(`${actorId}\0${transferId}\0${callerKey}`)
}

function mapUploadedFile(row: UploadIntentRow): WorkspaceUploadedFile {
  return {
    id: row.file_id,
    fileName: row.display_filename,
    state: FileStatusSchema.parse(row.file_state),
    size: Number(row.actual_size_bytes ?? row.expected_size_bytes),
    contentType: row.actual_mime_type ?? row.expected_mime_type,
    etag: row.object_etag,
    uploadedAt: row.uploaded_at ? asDate(row.uploaded_at).toISOString() : null
  }
}

function assertCapability(row: UploadIntentRow, capability: string, hash: (value: string) => string): void {
  if (!secureHashMatches(hash(capability), row.capability_nonce_hash)) {
    throw new WorkspaceSendUploadError('CAPABILITY_INVALID', 'Invalid upload completion capability')
  }
}

function assertIntentUsable(row: UploadIntentRow, now: Date): void {
  if (row.status === 'completed') return
  if (row.status !== 'pending' && row.status !== 'uploading') {
    throw new WorkspaceSendUploadError('INTENT_UNAVAILABLE', 'Upload intent is no longer available')
  }
  if (asDate(row.expires_at).getTime() <= now.getTime()) {
    throw new WorkspaceSendUploadError('INTENT_EXPIRED', 'Upload intent has expired')
  }
}

function multipartGeometry(row: UploadIntentRow): MultipartGeometry {
  if (row.upload_method !== 'multipart'
    || !row.multipart_upload_id
    || row.multipart_part_size_bytes === null) {
    throw new WorkspaceSendUploadError('MULTIPART_REQUIRED', 'Upload intent is not ready for multipart upload')
  }
  try {
    return resolveMultipartGeometry(
      Number(row.expected_size_bytes),
      Number(row.multipart_part_size_bytes)
    )
  } catch {
    throw new WorkspaceSendUploadError('MULTIPART_MISMATCH', 'Multipart upload geometry is invalid')
  }
}

function assertMultipartActive(row: UploadIntentRow): void {
  if (row.status === 'completed') {
    throw new WorkspaceSendUploadError('INTENT_UNAVAILABLE', 'Completed upload cannot accept multipart operations')
  }
}

function validateMultipartParts(
  geometry: MultipartGeometry,
  parts: MultipartStoragePart[],
  requireComplete: boolean
): MultipartStoragePart[] {
  const seen = new Set<number>()
  const canonical = [...parts].sort((left, right) => left.partNumber - right.partNumber)
  for (const part of canonical) {
    if (seen.has(part.partNumber)) {
      throw new WorkspaceSendUploadError('MULTIPART_MISMATCH', 'Multipart upload contains a duplicate part')
    }
    seen.add(part.partNumber)
    let expectedSize: number
    try {
      expectedSize = expectedMultipartPartSize(geometry, part.partNumber)
    } catch {
      throw new WorkspaceSendUploadError('MULTIPART_MISMATCH', 'Multipart upload contains an unexpected part')
    }
    if (part.sizeBytes !== expectedSize || !part.etag) {
      throw new WorkspaceSendUploadError('MULTIPART_MISMATCH', 'Multipart upload part metadata does not match its intent')
    }
  }
  if (requireComplete && (canonical.length !== geometry.partCount
    || canonical.some((part, index) => part.partNumber !== index + 1))) {
    throw new WorkspaceSendUploadError('MULTIPART_MISMATCH', 'Multipart upload is incomplete')
  }
  return canonical
}

async function defaultGetObjectMetadata(key: string): Promise<SendObjectMetadata | null> {
  const metadata = await getFileMetadata(key)
  if (!metadata) return null
  return {
    key,
    size: metadata.size,
    contentType: metadata.contentType,
    etag: metadata.etag,
    uploaded: metadata.lastModified ?? null
  }
}

export function createWorkspaceSendUploadService(
  overrides: Partial<WorkspaceSendUploadServiceDeps> = {}
) {
  const deps: WorkspaceSendUploadServiceDeps = {
    queryOne: overrides.queryOne ?? defaultQueryOne,
    transaction: overrides.transaction ?? defaultTransaction,
    createId: overrides.createId ?? randomUUID,
    createCapability: overrides.createCapability ?? (() => randomBytes(32).toString('base64url')),
    hashCapability: overrides.hashCapability ?? sha256,
    createUploadUrl: overrides.createUploadUrl ?? getPresignedUploadUrl,
    getObjectMetadata: overrides.getObjectMetadata ?? defaultGetObjectMetadata,
    createMultipartUpload: overrides.createMultipartUpload ?? createMultipartObject,
    createMultipartPartUrl: overrides.createMultipartPartUrl ?? getPresignedMultipartPartUrl,
    listMultipartParts: overrides.listMultipartParts ?? listMultipartObjectParts,
    completeMultipartUpload: overrides.completeMultipartUpload ?? completeMultipartObject,
    abortMultipartUpload: overrides.abortMultipartUpload ?? abortMultipartObject
  }

  async function getAuthorizedIntent(input: {
    actor: WorkspaceSendActor
    transferId: string
    fileId: string
    intentId: string
  }): Promise<UploadIntentRow | null> {
    return deps.queryOne<UploadIntentRow>(
      `SELECT ${INTENT_COLUMNS}
         FROM send_upload_intents i
         JOIN send_files f
           ON f.transfer_id = i.transfer_id
          AND f.id = i.file_id
         JOIN send_transfers t ON t.id = i.transfer_id
        WHERE i.id = $1
          AND i.file_id = $2
          AND i.transfer_id = $3
          AND i.uploader_class = 'workspace'
          AND i.uploader_id = $4
          AND t.sender_class = 'workspace'
          AND (
            $5::boolean
            OR t.owner_team_member_id = $4
            OR (t.client_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM client_team_assignments a
               WHERE a.client_id = t.client_id
                 AND a.team_member_id = $4
            ))
          )`,
      [input.intentId, input.fileId, input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
    )
  }

  return {
    async createIntent(input: {
      actor: WorkspaceSendActor
      transferId: string
      declaration: FileDeclaration & { idempotencyKey: string }
      ttlSeconds: number
      multipart?: { thresholdBytes: number, partSizeBytes: number }
      now?: Date
    }): Promise<WorkspaceUploadIntentResponse> {
      const now = input.now ?? new Date()
      if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 3600) {
        throw new WorkspaceSendUploadError('POLICY_REJECTED', 'Upload intent lifetime is outside policy')
      }
      const fileId = deps.createId()
      const intentId = deps.createId()
      const capability = deps.createCapability()
      const capabilityHash = deps.hashCapability(capability)
      const idempotencyHash = scopedIdempotencyKey(
        input.actor.id,
        input.transferId,
        input.declaration.idempotencyKey
      )
      const objectKey = `send/${input.transferId}/${fileId}`
      const displayFilename = canonicalFilename(input.declaration.fileName)
      const configuredMultipart = input.multipart ?? {
        thresholdBytes: 100 * 1024 * 1024,
        partSizeBytes: 16 * 1024 * 1024
      }
      if (!Number.isSafeInteger(configuredMultipart.thresholdBytes)
        || configuredMultipart.thresholdBytes <= 0) {
        throw new WorkspaceSendUploadError('POLICY_REJECTED', 'Multipart upload threshold is invalid')
      }
      const requestedUploadMethod = input.declaration.fileSize >= configuredMultipart.thresholdBytes
        ? 'multipart'
        : 'single'
      let requestedGeometry: MultipartGeometry | null = null
      if (requestedUploadMethod === 'multipart') {
        try {
          requestedGeometry = resolveMultipartGeometry(
            input.declaration.fileSize,
            configuredMultipart.partSizeBytes
          )
        } catch {
          throw new WorkspaceSendUploadError('POLICY_REJECTED', 'Multipart upload geometry is outside policy')
        }
      }

      const canonical = await deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const transferResult = await db.query(
          `SELECT t.id, t.status, t.configured_max_bytes, t.configured_max_files,
                  t.expected_total_bytes, t.expected_file_count, t.expires_at,
                  t.policy_snapshot
             FROM send_transfers t
            WHERE t.id = $1
              AND t.sender_class = 'workspace'
              AND (
                $3::boolean
                OR t.owner_team_member_id = $2
                OR (t.client_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM client_team_assignments a
                   WHERE a.client_id = t.client_id
                     AND a.team_member_id = $2
                ))
              )
            FOR UPDATE`,
          [input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
        )
        const transfer = transferResult.rows[0] as TransferUploadRow | undefined
        if (!transfer) throw new WorkspaceSendUploadError('NOT_FOUND', 'Transfer not found')
        if (!['draft', 'uploading'].includes(transfer.status)) {
          throw new WorkspaceSendUploadError('TRANSFER_UNAVAILABLE', 'Transfer does not accept uploads')
        }
        const transferExpiresAt = asDate(transfer.expires_at)
        if (transferExpiresAt.getTime() <= now.getTime()) {
          throw new WorkspaceSendUploadError('POLICY_REJECTED', 'Transfer has expired')
        }

        const existingResult = await db.query(
          `SELECT ${INTENT_COLUMNS}
             FROM send_upload_intents i
             JOIN send_files f
               ON f.transfer_id = i.transfer_id
              AND f.id = i.file_id
            WHERE i.transfer_id = $1
              AND i.uploader_class = 'workspace'
              AND i.uploader_id = $2
              AND i.idempotency_key = $3
            LIMIT 1`,
          [input.transferId, input.actor.id, idempotencyHash]
        )
        const existing = existingResult.rows[0] as UploadIntentRow | undefined
        const expiresAt = new Date(Math.min(
          now.getTime() + input.ttlSeconds * 1000,
          transferExpiresAt.getTime()
        ))
        if (existing) {
          if (existing.status === 'completed' || existing.status === 'aborted') {
            throw new WorkspaceSendUploadError('INTENT_UNAVAILABLE', 'Upload intent is no longer available')
          }
          if (existing.expected_size_bytes.toString() !== input.declaration.fileSize.toString()
            || existing.expected_mime_type !== input.declaration.contentType
            || existing.original_filename !== displayFilename) {
            throw new WorkspaceSendUploadError('POLICY_REJECTED', 'Idempotency key was already used for another file')
          }
          await db.query(
            `UPDATE send_upload_intents
                SET capability_nonce_hash = $2,
                    expires_at = $3,
                    status = 'pending',
                    aborted_at = NULL,
                    updated_at = NOW()
              WHERE id = $1`,
            [existing.id, capabilityHash, expiresAt.toISOString()]
          )
          return { ...existing, capability_nonce_hash: capabilityHash, expires_at: expiresAt }
        }

        const configuredMaxBytes = Number(transfer.configured_max_bytes)
        const configuredMaxFiles = Number(transfer.configured_max_files)
        const expectedBytes = Number(transfer.expected_total_bytes)
        const expectedFiles = Number(transfer.expected_file_count)
        const configuredMaxFileBytes = maxFileBytes(transfer.policy_snapshot)
        if (!configuredMaxFileBytes
          || input.declaration.fileSize > configuredMaxFileBytes
          || expectedBytes + input.declaration.fileSize > configuredMaxBytes
          || expectedFiles + 1 > configuredMaxFiles) {
          throw new WorkspaceSendUploadError('POLICY_REJECTED', 'File exceeds the transfer upload policy')
        }

        await db.query(
          `INSERT INTO send_files (
             id, transfer_id, object_key, original_filename, display_filename,
             expected_size_bytes, declared_mime_type, upload_method,
             state, upload_started_at
           ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, 'uploading', $8)
           RETURNING id`,
          [
            fileId,
            input.transferId,
            objectKey,
            displayFilename,
            input.declaration.fileSize,
            input.declaration.contentType,
            requestedUploadMethod,
            now.toISOString()
          ]
        )
        const intentResult = await db.query(
          `INSERT INTO send_upload_intents (
             id, transfer_id, file_id, uploader_class, uploader_id,
             object_key, expected_size_bytes, expected_mime_type, upload_method,
             multipart_part_size_bytes, capability_nonce_hash, idempotency_key, expires_at
           ) VALUES ($1, $2, $3, 'workspace', $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            intentId,
            input.transferId,
            fileId,
            input.actor.id,
            objectKey,
            input.declaration.fileSize,
            input.declaration.contentType,
            requestedUploadMethod,
            requestedGeometry?.partSizeBytes ?? null,
            capabilityHash,
            idempotencyHash,
            expiresAt.toISOString()
          ]
        )
        if (!intentResult.rows[0]) throw new Error('Upload intent was not persisted')

        await db.query(
          `UPDATE send_transfers
              SET status = CASE WHEN status = 'draft' THEN 'uploading' ELSE status END,
                  expected_file_count = expected_file_count + 1,
                  expected_total_bytes = expected_total_bytes + $2,
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1`,
          [input.transferId, input.declaration.fileSize]
        )
        await db.query(
          `INSERT INTO send_events (
             transfer_id, file_id, actor_class, actor_id, event_type,
             idempotency_key, metadata
           ) VALUES ($1, $2, 'workspace_user', $3, 'upload_intent_created', $4, $5::jsonb)`,
          [
            input.transferId,
            fileId,
            input.actor.id,
            `upload-intent:${idempotencyHash}`,
            JSON.stringify({
              fileId,
              expectedSizeBytes: input.declaration.fileSize,
              expectedMimeType: input.declaration.contentType,
              uploadMethod: requestedUploadMethod
            })
          ]
        )
        return intentRowFromCreate({
          intentId,
          transferId: input.transferId,
          fileId,
          actorId: input.actor.id,
          objectKey,
          declaration: input.declaration,
          displayFilename,
          capabilityHash,
          expiresAt,
          uploadMethod: requestedUploadMethod,
          multipartPartSizeBytes: requestedGeometry?.partSizeBytes ?? null
        })
      })

      if (canonical.upload_method === 'multipart') {
        let uploadId = canonical.multipart_upload_id
        if (!uploadId) {
          try {
            uploadId = await deps.createMultipartUpload(canonical.object_key, canonical.expected_mime_type)
            const registered = await deps.queryOne<{ id: string }>(
              `UPDATE send_upload_intents
                  SET multipart_upload_id = $2, status = 'uploading', updated_at = NOW()
                WHERE id = $1
                  AND upload_method = 'multipart'
                  AND multipart_upload_id IS NULL
              RETURNING id`,
              [canonical.id, uploadId]
            )
            if (!registered) {
              await deps.abortMultipartUpload({ key: canonical.object_key, uploadId })
              throw new Error('Multipart upload registration lost its canonical intent')
            }
          } catch {
            throw new WorkspaceSendUploadError('STORAGE_UNAVAILABLE', 'Multipart upload storage is unavailable')
          }
        }
        const geometry = multipartGeometry({ ...canonical, multipart_upload_id: uploadId })
        return {
          uploadMethod: 'multipart',
          fileId: canonical.file_id,
          intentId: canonical.id,
          capability,
          partSizeBytes: geometry.partSizeBytes,
          partCount: geometry.partCount,
          expiresAt: asDate(canonical.expires_at).toISOString()
        }
      }

      let uploadUrl: string
      try {
        const secondsRemaining = Math.max(1, Math.floor((asDate(canonical.expires_at).getTime() - now.getTime()) / 1000))
        uploadUrl = await deps.createUploadUrl(
          canonical.object_key,
          canonical.expected_mime_type,
          secondsRemaining
        )
      } catch {
        throw new WorkspaceSendUploadError('STORAGE_UNAVAILABLE', 'Upload storage is unavailable')
      }

      return {
        uploadMethod: 'single',
        fileId: canonical.file_id,
        intentId: canonical.id,
        uploadUrl,
        capability,
        requiredHeaders: { 'Content-Type': canonical.expected_mime_type },
        expiresAt: asDate(canonical.expires_at).toISOString()
      }
    },

    async resumeMultipartIntent(input: {
      actor: WorkspaceSendActor
      transferId: string
      fileId: string
      intentId: string
      capability: string
      now?: Date
    }): Promise<WorkspaceMultipartResumeResponse> {
      const now = input.now ?? new Date()
      const candidate = await getAuthorizedIntent(input)
      if (!candidate) throw new WorkspaceSendUploadError('NOT_FOUND', 'Upload intent not found')
      assertCapability(candidate, input.capability, deps.hashCapability)
      assertIntentUsable(candidate, now)
      assertMultipartActive(candidate)
      const geometry = multipartGeometry(candidate)
      let parts: MultipartStoragePart[]
      try {
        parts = await deps.listMultipartParts({
          key: candidate.object_key,
          uploadId: candidate.multipart_upload_id as string
        })
      } catch (error) {
        if (error instanceof WorkspaceSendUploadError) throw error
        throw new WorkspaceSendUploadError('STORAGE_UNAVAILABLE', 'Multipart upload storage is unavailable')
      }
      const canonical = validateMultipartParts(geometry, parts, false)
      return {
        partSizeBytes: geometry.partSizeBytes,
        partCount: geometry.partCount,
        uploadedParts: canonical.map(part => ({
          partNumber: part.partNumber,
          sizeBytes: part.sizeBytes
        })),
        expiresAt: asDate(candidate.expires_at).toISOString()
      }
    },

    async createMultipartPartIntent(input: {
      actor: WorkspaceSendActor
      transferId: string
      fileId: string
      intentId: string
      capability: string
      partNumber: number
      ttlSeconds: number
      now?: Date
    }): Promise<WorkspaceMultipartPartResponse> {
      const now = input.now ?? new Date()
      if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 3600) {
        throw new WorkspaceSendUploadError('POLICY_REJECTED', 'Multipart part lifetime is outside policy')
      }
      const candidate = await getAuthorizedIntent(input)
      if (!candidate) throw new WorkspaceSendUploadError('NOT_FOUND', 'Upload intent not found')
      assertCapability(candidate, input.capability, deps.hashCapability)
      assertIntentUsable(candidate, now)
      assertMultipartActive(candidate)
      const geometry = multipartGeometry(candidate)
      try {
        expectedMultipartPartSize(geometry, input.partNumber)
      } catch {
        throw new WorkspaceSendUploadError('MULTIPART_INVALID_PART', 'Multipart part number is invalid')
      }
      const secondsRemaining = Math.max(1, Math.min(
        input.ttlSeconds,
        Math.floor((asDate(candidate.expires_at).getTime() - now.getTime()) / 1000)
      ))
      try {
        const uploadUrl = await deps.createMultipartPartUrl({
          key: candidate.object_key,
          uploadId: candidate.multipart_upload_id as string,
          partNumber: input.partNumber,
          expiresIn: secondsRemaining
        })
        return {
          partNumber: input.partNumber,
          uploadUrl,
          expiresAt: new Date(now.getTime() + secondsRemaining * 1000).toISOString()
        }
      } catch {
        throw new WorkspaceSendUploadError('STORAGE_UNAVAILABLE', 'Multipart upload storage is unavailable')
      }
    },

    async completeIntent(input: {
      actor: WorkspaceSendActor
      transferId: string
      fileId: string
      intentId: string
      capability: string
      now?: Date
    }): Promise<WorkspaceUploadedFile> {
      const now = input.now ?? new Date()
      const candidate = await getAuthorizedIntent(input)
      if (!candidate) throw new WorkspaceSendUploadError('NOT_FOUND', 'Upload intent not found')
      assertCapability(candidate, input.capability, deps.hashCapability)
      assertIntentUsable(candidate, now)
      if (candidate.status === 'completed') return mapUploadedFile(candidate)

      if (candidate.upload_method === 'multipart') {
        const geometry = multipartGeometry(candidate)
        try {
          const parts = validateMultipartParts(
            geometry,
            await deps.listMultipartParts({
              key: candidate.object_key,
              uploadId: candidate.multipart_upload_id as string
            }),
            true
          )
          await deps.completeMultipartUpload({
            key: candidate.object_key,
            uploadId: candidate.multipart_upload_id as string,
            parts
          })
        } catch (error) {
          if (error instanceof WorkspaceSendUploadError) throw error
          const recovered = await deps.getObjectMetadata(candidate.object_key).catch(() => null)
          const finalObjectMatches = recovered
            && recovered.key === candidate.object_key
            && recovered.size === Number(candidate.expected_size_bytes)
            && recovered.contentType.trim().toLowerCase() === candidate.expected_mime_type.trim().toLowerCase()
          if (!finalObjectMatches) {
            const message = isMultipartUploadMissing(error)
              ? 'Multipart upload is no longer available'
              : 'Multipart upload storage is unavailable'
            throw new WorkspaceSendUploadError('STORAGE_UNAVAILABLE', message)
          }
        }
      }

      const metadata = await deps.getObjectMetadata(candidate.object_key)
      if (!metadata) throw new WorkspaceSendUploadError('OBJECT_NOT_FOUND', 'Uploaded object was not found')
      if (metadata.key !== candidate.object_key
        || metadata.size !== Number(candidate.expected_size_bytes)
        || metadata.contentType.trim().toLowerCase() !== candidate.expected_mime_type.trim().toLowerCase()) {
        throw new WorkspaceSendUploadError('OBJECT_MISMATCH', 'Uploaded object does not match its upload intent')
      }

      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const lockedResult = await db.query(
          `SELECT ${INTENT_COLUMNS}
             FROM send_upload_intents i
             JOIN send_files f
               ON f.transfer_id = i.transfer_id
              AND f.id = i.file_id
             JOIN send_transfers t ON t.id = i.transfer_id
            WHERE i.id = $1
              AND i.file_id = $2
              AND i.transfer_id = $3
              AND i.uploader_class = 'workspace'
              AND i.uploader_id = $4
              AND t.sender_class = 'workspace'
              AND (
                $5::boolean
                OR t.owner_team_member_id = $4
                OR (t.client_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM client_team_assignments a
                   WHERE a.client_id = t.client_id
                     AND a.team_member_id = $4
                ))
              )
            FOR UPDATE OF i, f`,
          [input.intentId, input.fileId, input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
        )
        const locked = lockedResult.rows[0] as UploadIntentRow | undefined
        if (!locked) throw new WorkspaceSendUploadError('NOT_FOUND', 'Upload intent not found')
        const completionTime = input.now ?? new Date()
        assertCapability(locked, input.capability, deps.hashCapability)
        assertIntentUsable(locked, completionTime)
        if (locked.status === 'completed') return mapUploadedFile(locked)
        if (locked.object_key !== candidate.object_key
          || Number(locked.expected_size_bytes) !== metadata.size
          || locked.expected_mime_type.trim().toLowerCase() !== metadata.contentType.trim().toLowerCase()) {
          throw new WorkspaceSendUploadError('OBJECT_MISMATCH', 'Upload intent changed before confirmation')
        }

        const fileResult = await db.query(
          `UPDATE send_files
              SET state = 'uploaded',
                  actual_size_bytes = $3,
                  actual_mime_type = $4,
                  object_etag = $5,
                  uploaded_at = $6,
                  updated_at = NOW()
            WHERE transfer_id = $1
              AND id = $2
              AND state = 'uploading'
          RETURNING id AS file_id, transfer_id, original_filename, display_filename,
                    object_key, expected_size_bytes, declared_mime_type AS expected_mime_type,
                    state AS file_state, actual_size_bytes, actual_mime_type,
                    object_etag, uploaded_at`,
          [
            input.transferId,
            input.fileId,
            metadata.size,
            metadata.contentType,
            metadata.etag,
            (metadata.uploaded ?? completionTime).toISOString()
          ]
        )
        const updatedFile = fileResult.rows[0] as UploadIntentRow | undefined
        if (!updatedFile) throw new WorkspaceSendUploadError('INTENT_UNAVAILABLE', 'File is no longer uploadable')

        await db.query(
          `UPDATE send_upload_intents
              SET status = 'completed', completed_at = $2, updated_at = NOW()
            WHERE id = $1 AND status IN ('pending', 'uploading')`,
          [input.intentId, completionTime.toISOString()]
        )
        await db.query(
          `UPDATE send_transfers
              SET actual_file_count = actual_file_count + 1,
                  actual_total_bytes = actual_total_bytes + $2,
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1`,
          [input.transferId, metadata.size]
        )
        await db.query(
          `INSERT INTO send_events (
             transfer_id, file_id, actor_class, actor_id, event_type,
             idempotency_key, metadata
           ) VALUES ($1, $2, 'workspace_user', $3, 'upload_completed', $4, $5::jsonb)
           ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
          [
            input.transferId,
            input.fileId,
            input.actor.id,
            `upload-completed:${input.intentId}`,
            JSON.stringify({ fileId: input.fileId, sizeBytes: metadata.size })
          ]
        )
        return mapUploadedFile({ ...locked, ...updatedFile, status: 'completed', completed_at: completionTime })
      })
    },

    async abortIntent(input: {
      actor: WorkspaceSendActor
      transferId: string
      fileId: string
      intentId: string
      capability: string
      now?: Date
    }): Promise<{ aborted: true }> {
      const now = input.now ?? new Date()
      const candidate = await getAuthorizedIntent(input)
      if (!candidate) throw new WorkspaceSendUploadError('NOT_FOUND', 'Upload intent not found')
      assertCapability(candidate, input.capability, deps.hashCapability)
      if (candidate.status === 'aborted') return { aborted: true as const }
      if (candidate.status === 'completed') {
        throw new WorkspaceSendUploadError('INTENT_UNAVAILABLE', 'Completed upload cannot be aborted')
      }
      assertIntentUsable(candidate, now)
      if (candidate.upload_method === 'multipart') {
        const geometry = multipartGeometry(candidate)
        if (geometry.partCount < 1) {
          throw new WorkspaceSendUploadError('MULTIPART_MISMATCH', 'Multipart upload geometry is invalid')
        }
        try {
          await deps.abortMultipartUpload({
            key: candidate.object_key,
            uploadId: candidate.multipart_upload_id as string
          })
        } catch (error) {
          if (isMultipartUploadMissing(error)) {
            const finalObject = await deps.getObjectMetadata(candidate.object_key).catch(() => null)
            if (finalObject) {
              throw new WorkspaceSendUploadError(
                'INTENT_UNAVAILABLE',
                'Multipart upload has already been completed and cannot be aborted'
              )
            }
          } else {
            throw new WorkspaceSendUploadError('STORAGE_UNAVAILABLE', 'Multipart upload storage is unavailable')
          }
        }
      }
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const lockedResult = await db.query(
          `SELECT ${INTENT_COLUMNS}
             FROM send_upload_intents i
             JOIN send_files f
               ON f.transfer_id = i.transfer_id
              AND f.id = i.file_id
             JOIN send_transfers t ON t.id = i.transfer_id
            WHERE i.id = $1
              AND i.file_id = $2
              AND i.transfer_id = $3
              AND i.uploader_class = 'workspace'
              AND i.uploader_id = $4
              AND t.sender_class = 'workspace'
              AND (
                $5::boolean
                OR t.owner_team_member_id = $4
                OR (t.client_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM client_team_assignments a
                   WHERE a.client_id = t.client_id
                     AND a.team_member_id = $4
                ))
              )
            FOR UPDATE OF i, f`,
          [input.intentId, input.fileId, input.transferId, input.actor.id, MANAGEMENT_ROLES.has(input.actor.role)]
        )
        const locked = lockedResult.rows[0] as UploadIntentRow | undefined
        if (!locked) throw new WorkspaceSendUploadError('NOT_FOUND', 'Upload intent not found')
        assertCapability(locked, input.capability, deps.hashCapability)
        if (locked.status === 'aborted') return { aborted: true as const }
        if (locked.status === 'completed') {
          throw new WorkspaceSendUploadError('INTENT_UNAVAILABLE', 'Completed upload cannot be aborted')
        }
        assertIntentUsable(locked, now)

        await db.query(
          `UPDATE send_upload_intents
              SET status = 'aborted', aborted_at = $2, updated_at = NOW()
            WHERE id = $1 AND status IN ('pending', 'uploading')`,
          [input.intentId, now.toISOString()]
        )
        await db.query(
          `UPDATE send_files
              SET state = 'aborted', updated_at = NOW()
            WHERE transfer_id = $1
              AND id = $2
              AND state = 'uploading'`,
          [input.transferId, input.fileId]
        )
        await db.query(
          `UPDATE send_transfers
              SET expected_file_count = GREATEST(0, expected_file_count - 1),
                  expected_total_bytes = GREATEST(0, expected_total_bytes - $2),
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1`,
          [input.transferId, Number(locked.expected_size_bytes)]
        )
        await db.query(
          `INSERT INTO send_events (
             transfer_id, file_id, actor_class, actor_id, event_type,
             idempotency_key, metadata
           ) VALUES ($1, $2, 'workspace_user', $3, 'upload_aborted', $4, $5::jsonb)
           ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
          [
            input.transferId,
            input.fileId,
            input.actor.id,
            `upload-aborted:${input.intentId}`,
            JSON.stringify({ fileId: input.fileId, action: 'upload_aborted' })
          ]
        )
        return { aborted: true as const }
      })
    }
  }
}

function intentRowFromCreate(input: {
  intentId: string
  transferId: string
  fileId: string
  actorId: string
  objectKey: string
  declaration: FileDeclaration
  displayFilename: string
  capabilityHash: string
  expiresAt: Date
  uploadMethod: 'single' | 'multipart'
  multipartPartSizeBytes: number | null
}): UploadIntentRow {
  return {
    id: input.intentId,
    transfer_id: input.transferId,
    file_id: input.fileId,
    uploader_id: input.actorId,
    object_key: input.objectKey,
    expected_size_bytes: input.declaration.fileSize,
    expected_mime_type: input.declaration.contentType,
    original_filename: input.displayFilename,
    display_filename: input.displayFilename,
    status: 'pending',
    file_state: 'uploading',
    capability_nonce_hash: input.capabilityHash,
    expires_at: input.expiresAt,
    completed_at: null,
    actual_size_bytes: null,
    actual_mime_type: null,
    object_etag: null,
    uploaded_at: null,
    upload_method: input.uploadMethod,
    multipart_upload_id: null,
    multipart_part_size_bytes: input.multipartPartSizeBytes
  }
}

export function toWorkspaceSendUploadHttpError(error: unknown): never {
  if (!(error instanceof WorkspaceSendUploadError)) throw error
  const statusCode = {
    NOT_FOUND: 404,
    POLICY_REJECTED: 409,
    TRANSFER_UNAVAILABLE: 409,
    INTENT_EXPIRED: 410,
    INTENT_UNAVAILABLE: 409,
    CAPABILITY_INVALID: 403,
    OBJECT_NOT_FOUND: 409,
    OBJECT_MISMATCH: 409,
    MULTIPART_REQUIRED: 409,
    MULTIPART_INVALID_PART: 400,
    MULTIPART_MISMATCH: 409,
    STORAGE_UNAVAILABLE: 503
  }[error.code]
  throw createError({ statusCode, statusMessage: error.message })
}
