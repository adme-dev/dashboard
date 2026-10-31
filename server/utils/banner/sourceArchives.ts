import { createError, type H3Event } from 'h3'
import type { User } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * Private retention of original TheBrief HTML5 export ZIPs (one per size).
 * An archive's identity is (client, design, SHA-256); its R2 key encodes exactly
 * that identity, under `thebrief-sources/`, and is only ever served through the
 * authenticated download route. No public URL is stored.
 */

export const SOURCE_ARCHIVE_PREFIX = 'thebrief-sources'
export const SOURCE_ARCHIVE_UNASSIGNED = 'unassigned'
/** Child ZIPs run to ~51 MB; stay well under the ~100 MB Pages request body limit. */
export const SOURCE_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024
export const SOURCE_ARCHIVE_STATUSES = ['imported', 'held', 'pending'] as const
export type SourceArchiveStatus = typeof SOURCE_ARCHIVE_STATUSES[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
const DESIGN_HASH = /^[0-9a-z]{4,32}$/
const SIZE_LABEL = /^[0-9]{1,5}x[0-9]{1,5}$/
const ZIP_MAGIC = [0x50, 0x4B, 0x03, 0x04]

export interface SourceArchiveMetadata {
  sha256: string
  bytes: number
  clientId: string | null
  designHash: string
  childHash: string | null
  filename: string
  folderPath: string | null
  sizeLabel: string | null
  batchSha256: string | null
  projectId: string | null
  status: SourceArchiveStatus
  holdReason: string | null
}

export interface SourceArchiveRow {
  id: string
  clientId: string | null
  designHash: string
  childHash: string | null
  sha256: string
  bytes: number
  filename: string
  folderPath: string | null
  sizeLabel: string | null
  batchSha256: string | null
  r2Key: string
  projectId: string | null
  status: SourceArchiveStatus
  holdReason: string | null
  uploadedBy: string
  createdAt: string
  /** NULL while the row is only a reservation: the R2 write has not been confirmed. */
  storedAt: string | null
  updatedAt: string
}

/** Select list producing {@link SourceArchiveRow}. */
export const SOURCE_ARCHIVE_COLUMNS = `
  id, client_id AS "clientId", source_design_hash AS "designHash", source_child_hash AS "childHash",
  sha256, bytes::float8 AS bytes, original_filename AS filename, source_folder_path AS "folderPath",
  size_label AS "sizeLabel", source_batch_sha256 AS "batchSha256", r2_key AS "r2Key",
  project_id AS "projectId", conversion_status AS status, hold_reason AS "holdReason",
  uploaded_by AS "uploadedBy", created_at AS "createdAt", stored_at AS "storedAt", updated_at AS "updatedAt"`

/** ON CONFLICT target matching banner_source_archives_identity_idx. */
export const SOURCE_ARCHIVE_IDENTITY_CONFLICT
  = `((COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)), source_design_hash, sha256)`

/** WHERE clause for one archive identity: $1 client (nullable), $2 design hash, $3 SHA-256. */
export const SOURCE_ARCHIVE_IDENTITY_WHERE
  = 'client_id IS NOT DISTINCT FROM $1::uuid AND source_design_hash = $2 AND sha256 = $3'

function invalid(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') invalid('Invalid archive metadata')
  const trimmed = value.trim()
  return trimmed || null
}

export function isSourceArchiveId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function isSourceArchiveSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value)
}

export function isSourceDesignHash(value: unknown): value is string {
  return typeof value === 'string' && DESIGN_HASH.test(value)
}

export function parseSourceArchiveStatus(value: unknown): SourceArchiveStatus {
  if (typeof value === 'string' && (SOURCE_ARCHIVE_STATUSES as readonly string[]).includes(value)) {
    return value as SourceArchiveStatus
  }
  invalid('status must be imported, held or pending')
}

export function parseSourceHoldReason(value: unknown): string | null {
  const reason = text(value)
  if (reason && reason.length > 2000) invalid('holdReason is too long')
  return reason
}

/** Validates upload metadata supplied as query parameters alongside the raw ZIP body. */
export function parseSourceArchiveMetadata(query: Record<string, unknown>): SourceArchiveMetadata {
  const sha256 = text(query.sha256)?.toLowerCase()
  if (!isSourceArchiveSha256(sha256)) invalid('sha256 must be 64 lowercase hex characters')

  const bytesText = text(query.bytes)
  const bytes = bytesText && /^\d+$/.test(bytesText) ? Number(bytesText) : Number.NaN
  if (!Number.isSafeInteger(bytes) || bytes <= 0) invalid('bytes must be a positive integer')
  if (bytes > SOURCE_ARCHIVE_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Archive exceeds the 64 MB limit' })
  }

  const clientId = text(query.clientId)
  if (clientId && !UUID.test(clientId)) invalid('Invalid clientId')
  const projectId = text(query.projectId)
  if (projectId && !UUID.test(projectId)) invalid('Invalid projectId')

  const designHash = text(query.designHash)
  if (!isSourceDesignHash(designHash)) invalid('Invalid designHash')
  const childHash = text(query.childHash)
  if (childHash && !isSourceDesignHash(childHash)) invalid('Invalid childHash')

  const filename = text(query.filename)
  if (!filename || filename.length > 255 || !filename.toLowerCase().endsWith('.zip')
    || filename.includes('/') || filename.includes('\\') || containsControlCharacter(filename)) {
    invalid('Invalid filename')
  }
  const folderPath = text(query.folderPath)
  if (folderPath && (folderPath.length > 500 || containsControlCharacter(folderPath))) invalid('Invalid folderPath')
  const sizeLabel = text(query.sizeLabel)
  if (sizeLabel && !SIZE_LABEL.test(sizeLabel)) invalid('Invalid sizeLabel')
  const batchSha256 = text(query.batchSha256)?.toLowerCase() ?? null
  if (batchSha256 && !isSourceArchiveSha256(batchSha256)) invalid('Invalid batchSha256')

  const status = parseSourceArchiveStatus(text(query.status) ?? 'pending')
  if (status === 'imported' && !projectId) invalid('An imported archive must name its projectId')

  return {
    sha256,
    bytes,
    clientId: clientId?.toLowerCase() ?? null,
    designHash,
    childHash,
    filename,
    folderPath,
    sizeLabel,
    batchSha256,
    projectId: projectId?.toLowerCase() ?? null,
    status,
    holdReason: parseSourceHoldReason(query.holdReason)
  }
}

/** `thebrief-sources/<clientId|unassigned>/<designHash>/<sha256>.zip` */
export function sourceArchiveKey(clientId: string | null, designHash: string, sha256: string): string {
  if (clientId !== null && !UUID.test(clientId)) throw new Error('Invalid source archive client')
  if (!DESIGN_HASH.test(designHash)) throw new Error('Invalid source archive design hash')
  if (!SHA256.test(sha256)) throw new Error('Invalid source archive SHA-256')
  return `${SOURCE_ARCHIVE_PREFIX}/${clientId?.toLowerCase() ?? SOURCE_ARCHIVE_UNASSIGNED}/${designHash}/${sha256}.zip`
}

export function isSourceArchiveKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  const parts = key.split('/')
  return parts.length === 4
    && parts[0] === SOURCE_ARCHIVE_PREFIX
    && (parts[1] === SOURCE_ARCHIVE_UNASSIGNED || UUID.test(parts[1] ?? ''))
    && DESIGN_HASH.test(parts[2] ?? '')
    && /^[0-9a-f]{64}\.zip$/.test(parts[3] ?? '')
}

// ── Storage ─────────────────────────────────────────────────────────

export interface SourceArchiveBucket {
  put: (key: string, value: ReadableStream | Uint8Array, options?: {
    sha256?: string
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  }) => Promise<unknown>
  head: (key: string) => Promise<{ size: number, checksums?: { sha256?: ArrayBuffer } } | null>
  get: (key: string) => Promise<{ size: number, httpEtag: string, body?: ReadableStream } | null>
}

export function sourceArchiveBucket(event: { context?: unknown }): SourceArchiveBucket {
  const bucket = (event.context as { cloudflare?: { env?: { MEDIA_BUCKET?: unknown } } } | undefined)
    ?.cloudflare?.env?.MEDIA_BUCKET as SourceArchiveBucket | undefined
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.head !== 'function' || typeof bucket.get !== 'function') {
    throw createError({ statusCode: 503, statusMessage: 'Source archive storage is unavailable' })
  }
  return bucket
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function bytesOf(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk)
  invalid('Unreadable archive body')
}

function mismatch(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message })
}

/**
 * Enforces the declared length and ZIP signature while bytes pass through. A
 * body larger than declared is rejected before the excess is forwarded.
 */
function boundedZipStream(expectedBytes: number) {
  let seen = 0
  const head: number[] = []
  return new TransformStream<unknown, Uint8Array>({
    transform(chunk, controller) {
      const bytes = bytesOf(chunk)
      seen += bytes.byteLength
      if (seen > expectedBytes) throw createError({ statusCode: 413, statusMessage: 'Archive body exceeds its declared size' })
      for (let index = 0; head.length < ZIP_MAGIC.length && index < bytes.length; index += 1) head.push(bytes[index]!)
      if (head.length === ZIP_MAGIC.length && head.some((byte, index) => byte !== ZIP_MAGIC[index])) {
        invalid('Archive is not a ZIP file')
      }
      controller.enqueue(bytes)
    },
    flush() {
      if (seen !== expectedBytes) mismatch('Archive body does not match its declared size')
    }
  })
}

async function readBounded(body: ReadableStream, expectedBytes: number): Promise<Uint8Array> {
  const reader = body.pipeThrough(boundedZipStream(expectedBytes)).getReader()
  const output = new Uint8Array(expectedBytes)
  let offset = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    output.set(value, offset)
    offset += value.byteLength
  }
  return output
}

type FixedLengthStreamConstructor = new (length: number) => { readable: ReadableStream, writable: WritableStream }

/**
 * Writes the archive to R2 and proves the stored bytes match the declared SHA-256.
 * On Workers the body streams through `FixedLengthStream` and R2 itself rejects a
 * digest mismatch (`sha256` put option), so a 50 MB archive is never buffered.
 * Elsewhere the body is buffered (bounded) and hashed before the write.
 */
export async function storeSourceArchive(
  bucket: SourceArchiveBucket,
  key: string,
  body: ReadableStream,
  metadata: Pick<SourceArchiveMetadata, 'sha256' | 'bytes' | 'designHash'>
): Promise<void> {
  const options = {
    sha256: metadata.sha256,
    httpMetadata: { contentType: 'application/zip' },
    customMetadata: { source: 'thebrief', designHash: metadata.designHash, sha256: metadata.sha256 }
  }
  const FixedLength = (globalThis as { FixedLengthStream?: FixedLengthStreamConstructor }).FixedLengthStream

  if (FixedLength) {
    const fixed = new FixedLength(metadata.bytes)
    const piping = body.pipeThrough(boundedZipStream(metadata.bytes)).pipeTo(fixed.writable)
    const writing = bucket.put(key, fixed.readable, options)
    const [piped, written] = await Promise.allSettled([piping, writing])
    if (piped.status === 'rejected') throw piped.reason
    if (written.status === 'rejected') {
      const message = String((written.reason as { message?: unknown })?.message ?? written.reason)
      if (/sha-?256|checksum|digest|content-?md5/i.test(message)) mismatch('Archive SHA-256 does not match its content')
      throw written.reason
    }
  } else {
    const bytes = await readBounded(body, metadata.bytes)
    const digest = hex(await globalThis.crypto.subtle.digest('SHA-256', bytes))
    if (digest !== metadata.sha256) mismatch('Archive SHA-256 does not match its content')
    await bucket.put(key, bytes, options)
  }

  const stored = await bucket.head(key)
  if (!stored || stored.size !== metadata.bytes) {
    throw new Error('R2 write failed: source archive not persisted at its declared size')
  }
  const storedSha = stored.checksums?.sha256
  if (storedSha && hex(storedSha) !== metadata.sha256) mismatch('Archive SHA-256 does not match its content')
}

// ── Access ──────────────────────────────────────────────────────────

/**
 * Client archives follow normal client access. Unassigned archives are visible
 * only to all-client staff (ADMIN/MANAGEMENT), since no client grants them.
 */
export async function requireSourceArchiveClientAccess(
  event: H3Event,
  user: User,
  clientId: string | null
): Promise<void> {
  if (clientId) {
    await requireSocialClientAccess(event, clientId)
    return
  }
  if (!hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Unassigned source archives require all-client access' })
  }
}
