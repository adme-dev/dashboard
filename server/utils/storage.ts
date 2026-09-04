/**
 * Cloudflare R2 Storage Utility
 *
 * R2 is S3-compatible, so we use the AWS S3 SDK.
 * This utility handles file uploads, downloads, and presigned URLs.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { getCachedObjectBinding } from '~~/server/utils/email'
import { createR2PresignedObjectUrl } from '~~/server/utils/r2Presign'

// Local upload directory for dev without R2
const LOCAL_UPLOAD_DIR = join(process.cwd(), 'server', 'uploads')

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'agency-files'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '' // Optional: Custom domain for public files

// Create S3 client configured for R2
function getR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 storage is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    },
    // The Cloudflare Workers runtime (Nitro's unenv) does NOT implement
    // node:https.request, so the SDK's default node-http-handler throws
    // "[unenv] https.request is not implemented yet!" on every PutObject/Get/etc.
    // Force the fetch-based handler — fetch is native in workerd (and Node 18+),
    // so this works in both prod and local dev. Presigning never hit this (it
    // makes no HTTP call), which is why uploads 500'd while stream URLs worked.
    requestHandler: new FetchHttpHandler()
  })
}

/** Server-only R2 credentials used by workerd-safe SigV4 control-plane adapters. */
export function getR2StorageConfig(): {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
} {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 storage is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.')
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET_NAME
  }
}

// Minimal shape of the Cloudflare native R2 bucket binding (MEDIA_BUCKET).
export interface R2BucketBinding {
  get?: (key: string, options?: { range?: { offset: number; length?: number } }) => Promise<{
    body: ReadableStream
    size: number
    httpEtag: string
    httpMetadata?: { contentType?: string }
    range?: { offset: number; length: number }
  } | null>
  put: (key: string, value: Uint8Array, options?: {
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  }) => Promise<unknown>
  head: (key: string) => Promise<{
    key: string
    size: number
    etag: string
    httpEtag: string
    uploaded: Date
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  } | null>
  delete: (key: string) => Promise<void>
  list?: (options?: {
    prefix?: string
    cursor?: string
    limit?: number
    include?: string[]
  }) => Promise<{
    objects: Array<{ key: string, size: number, uploaded: Date }>
    truncated: boolean
    cursor?: string
  }>
}

export interface StoredObjectListPage {
  objects: Array<{ key: string, size: number, uploaded: Date | undefined }>
  truncated: boolean
  cursor?: string
}

/**
 * Cloudflare native R2 binding, when running on Pages/Workers. The S3 SDK's
 * fetch handler silently drops PutObject bodies in the workerd runtime (200
 * returned, no object written), so writes must go through this binding there.
 * The binding is pinned to the agency-files bucket in wrangler.toml, so it is
 * only used when config targets that bucket.
 */
function getNativeBucket(): R2BucketBinding | undefined {
  if (R2_BUCKET_NAME !== 'agency-files') return undefined
  return getCachedObjectBinding<R2BucketBinding>('MEDIA_BUCKET')
}

// File type categories for organization
export type FileCategory = 'avatars' | 'attachments' | 'expenses' | 'briefs' | 'invoices' | 'general' | 'media-video' | 'media-image'

// Allowed MIME types per category
const ALLOWED_TYPES: Record<FileCategory, string[]> = {
  'avatars': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  'attachments': [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/json',
    'application/zip', 'application/x-rar-compressed'
  ],
  'expenses': ['image/jpeg', 'image/png', 'application/pdf'],
  'briefs': [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  'invoices': ['application/pdf', 'image/jpeg', 'image/png'],
  'general': ['*'], // Allow all types
  // Video Studio AV-project media uploads
  'media-video': ['video/mp4', 'video/webm', 'video/quicktime'],
  'media-image': ['image/jpeg', 'image/png', 'image/webp']
}

// Max file sizes per category (in bytes)
const MAX_FILE_SIZES: Record<FileCategory, number> = {
  'avatars': 2 * 1024 * 1024, // 2MB
  'attachments': 50 * 1024 * 1024, // 50MB
  'expenses': 10 * 1024 * 1024, // 10MB
  'briefs': 25 * 1024 * 1024, // 25MB
  'invoices': 10 * 1024 * 1024, // 10MB
  'general': 100 * 1024 * 1024, // 100MB
  'media-video': 500 * 1024 * 1024, // 500MB
  'media-image': 50 * 1024 * 1024 // 50MB
}

/**
 * Validate file type for a category
 */
export function validateFileType(mimeType: string, category: FileCategory): boolean {
  const allowed = ALLOWED_TYPES[category]
  if (allowed.includes('*')) return true
  return allowed.includes(mimeType)
}

/**
 * Validate file size for a category
 */
export function validateFileSize(size: number, category: FileCategory): boolean {
  return size <= MAX_FILE_SIZES[category]
}

/**
 * Get max file size for a category
 */
export function getMaxFileSize(category: FileCategory): number {
  return MAX_FILE_SIZES[category]
}

/**
 * Get allowed types for a category
 */
export function getAllowedTypes(category: FileCategory): string[] {
  return ALLOWED_TYPES[category]
}

/**
 * Generate a storage key (path) for a file
 */
export function generateStorageKey(category: FileCategory, originalFileName: string, entityId?: string): string {
  const uuid = randomUUID()
  const extension = originalFileName.split('.').pop()?.toLowerCase() || ''
  const sanitizedName = originalFileName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9-_]/g, '-') // Replace special chars
    .substring(0, 50) // Limit length
    .toLowerCase()

  const timestamp = Date.now()

  if (entityId) {
    return `${category}/${entityId}/${timestamp}-${sanitizedName}-${uuid.substring(0, 8)}.${extension}`
  }

  return `${category}/${timestamp}-${sanitizedName}-${uuid.substring(0, 8)}.${extension}`
}

/**
 * Upload a file to R2, or to local filesystem if R2 is not configured
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ key: string, url: string, size: number }> {
  // Local filesystem fallback for dev without R2
  if (!isStorageConfigured()) {
    const filePath = join(LOCAL_UPLOAD_DIR, key)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
    return {
      key,
      url: `/api/_uploads/${key}`,
      size: buffer.length
    }
  }

  const bytes = new Uint8Array(buffer)
  const bucket = getNativeBucket()

  if (bucket) {
    // Native R2 binding — the only write path that persists in the Pages runtime.
    await bucket.put(key, bytes, {
      httpMetadata: { contentType },
      customMetadata: metadata
    })
    const head = await bucket.head(key)
    if (!head || !head.size) {
      throw new Error(`R2 write failed for ${key}: object not persisted after native put`)
    }
  } else {
    const client = getR2Client()

    // R2 PutObject. Body is sent as a Uint8Array with an explicit ContentLength: under
    // Nitro/unenv (dev) and workerd, the fetch handler can mishandle a Node Buffer body
    // (request sent with no body → 200 but nothing persisted), so normalise it.
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ContentLength: bytes.byteLength,
      Metadata: metadata
    }))
    // Verify the object actually persisted. The S3-over-fetch handler can return a 200
    // without writing the body in some serverless runtimes (UNSIGNED-PAYLOAD means R2 won't
    // reject a missing body), which silently created dead references. Fail loud instead.
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
      if (!head.ContentLength) throw new Error('zero-length')
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `R2 write failed for ${key}: object not persisted after PutObject (${detail})`,
        { cause: error }
      )
    }
  }

  // Return the public URL if configured, otherwise generate a presigned URL
  const url = R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : await getPresignedDownloadUrl(key, 7 * 24 * 60 * 60) // 7 days

  return {
    key,
    url,
    size: buffer.length
  }
}

/**
 * Delete a file from R2, or from local filesystem if R2 is not configured
 */
export async function deleteFile(key: string): Promise<void> {
  if (!isStorageConfigured()) {
    const filePath = join(LOCAL_UPLOAD_DIR, key)
    try {
      await fs.unlink(filePath)
    } catch {
      // File may not exist — ignore
    }
    return
  }

  const bucket = getNativeBucket()
  if (bucket) {
    await bucket.delete(key)
    return
  }

  const client = getR2Client()

  await client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key
  }))
}

/**
 * Download a stored file into memory. Intended for server-side processing jobs
 * such as transcription; callers should enforce their own size limits.
 */
export async function downloadFileBuffer(key: string): Promise<Buffer> {
  if (!isStorageConfigured()) {
    const filePath = join(LOCAL_UPLOAD_DIR, key)
    return fs.readFile(filePath)
  }

  const client = getR2Client()
  const response = await client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key
  }))

  const body = response.Body as {
    transformToByteArray?: () => Promise<Uint8Array>
    transformToString?: () => Promise<string>
  } | undefined

  if (body?.transformToByteArray) {
    return Buffer.from(await body.transformToByteArray())
  }

  if (body?.transformToString) {
    return Buffer.from(await body.transformToString())
  }

  throw new Error('Stored file response body is not readable')
}

export interface StoredObjectRange {
  body: ReadableStream
  contentType: string
  size: number
  range: { start: number; end: number } | null
  etag: string | null
}

/**
 * Read an object as a web stream for authenticated, same-origin delivery.
 * The request-scoped binding is preferred on Cloudflare Pages; local and S3
 * fallbacks retain the storage paths used elsewhere in this release.
 */
export async function readStoredObject(
  key: string,
  options: { range?: { start: number; end?: number }; requestBucket?: R2BucketBinding } = {}
): Promise<StoredObjectRange | null> {
  const { range, requestBucket } = options
  const bucket = requestBucket ?? getNativeBucket()
  if (bucket?.get) {
    const object = await bucket.get(key, range
      ? { range: { offset: range.start, length: range.end != null ? range.end - range.start + 1 : undefined } }
      : undefined)
    if (!object) return null
    const servedRange = object.range
      ? { start: object.range.offset, end: object.range.offset + object.range.length - 1 }
      : null
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      size: object.size,
      range: servedRange,
      etag: object.httpEtag ?? null
    }
  }

  if (!isStorageConfigured()) {
    const filePath = join(LOCAL_UPLOAD_DIR, key)
    let data: Buffer
    try {
      data = await fs.readFile(filePath)
    } catch {
      return null
    }
    const start = range?.start ?? 0
    const end = Math.min(range?.end ?? data.length - 1, data.length - 1)
    const slice = range ? data.subarray(start, end + 1) : data
    return {
      body: new Blob([slice]).stream(),
      contentType: 'application/octet-stream',
      size: data.length,
      range: range ? { start, end } : null,
      etag: null
    }
  }

  let response
  try {
    response = await getR2Client().send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ...(range ? { Range: `bytes=${range.start}-${range.end ?? ''}` } : {})
    }))
  } catch (error) {
    const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null
    if (failure?.$metadata?.httpStatusCode === 404
      || failure?.name === 'NotFound'
      || failure?.name === 'NoSuchKey') return null
    throw error
  }

  const body = response.Body as { transformToWebStream?: () => ReadableStream } | undefined
  if (!body?.transformToWebStream) throw new Error('Stored file response body is not streamable')
  const contentRange = /bytes (\d+)-(\d+)\/(\d+)/.exec(response.ContentRange ?? '')
  return {
    body: body.transformToWebStream(),
    contentType: response.ContentType ?? 'application/octet-stream',
    size: contentRange ? Number(contentRange[3]) : Number(response.ContentLength ?? 0),
    range: contentRange ? { start: Number(contentRange[1]), end: Number(contentRange[2]) } : null,
    etag: response.ETag ?? null
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  const bucket = getNativeBucket()
  if (bucket) return !!await bucket.head(key)

  const client = getR2Client()

  try {
    await client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    }))
    return true
  } catch {
    return false
  }
}

/**
 * Generate a presigned URL for uploading a file directly from the client
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  void contentType
  return createR2PresignedObjectUrl({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET_NAME,
    key,
    method: 'PUT',
    expiresIn
  })
}

/**
 * Generate a presigned URL for downloading a file
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600, // 1 hour default
  options: { fileName?: string } = {}
): Promise<string> {
  return createR2PresignedObjectUrl({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET_NAME,
    key,
    method: 'GET',
    expiresIn,
    responseContentDisposition: options.fileName
      ? buildAttachmentContentDisposition(options.fileName)
      : undefined
  })
}

export function buildAttachmentContentDisposition(fileName: string): string {
  const cleaned = fileName
    .replace(/[\p{Cc}]/gu, '')
    .replace(/[\\/"]/g, '_')
    .trim()
    .slice(0, 180) || 'download'
  const fallback = cleaned.replace(/[^\x20-\x7E]/g, '_')
  const encoded = encodeURIComponent(cleaned)
    .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Get file metadata
 */
export async function getFileMetadata(key: string): Promise<{
  size: number
  contentType: string
  etag: string | null
  lastModified: Date | undefined
  metadata: Record<string, string> | undefined
} | null> {
  const bucket = getNativeBucket()
  if (bucket) {
    const object = await bucket.head(key)
    if (!object) return null
    return {
      size: object.size,
      contentType: object.httpMetadata?.contentType || 'application/octet-stream',
      etag: object.etag || object.httpEtag || null,
      lastModified: object.uploaded,
      metadata: object.customMetadata
    }
  }

  const client = getR2Client()

  try {
    const response = await client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    }))

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      etag: response.ETag?.replace(/^"|"$/g, '') || null,
      lastModified: response.LastModified,
      metadata: response.Metadata
    }
  } catch (error) {
    const failure = error as {
      name?: string
      $metadata?: { httpStatusCode?: number }
    } | null
    if (failure?.$metadata?.httpStatusCode === 404
      || failure?.name === 'NotFound'
      || failure?.name === 'NoSuchKey') {
      return null
    }
    throw error
  }
}

/**
 * List one bounded object page. Callers must follow `truncated` rather than
 * assuming a short page is complete; R2 may return fewer objects than `limit`.
 */
export async function listStoredObjects(input: {
  prefix: string
  cursor?: string
  limit?: number
}): Promise<StoredObjectListPage> {
  if (!input.prefix || input.prefix.startsWith('/') || input.prefix.includes('..')) {
    throw new Error('Storage list prefix is invalid')
  }
  const limit = Math.max(1, Math.min(input.limit ?? 1000, 1000))
  const bucket = getNativeBucket()
  if (bucket?.list) {
    const page = await bucket.list({
      prefix: input.prefix,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit,
      include: []
    })
    if (page.truncated && !page.cursor) {
      throw new Error('R2 returned a truncated object list without a cursor')
    }
    return {
      objects: page.objects.map(object => ({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded
      })),
      truncated: page.truncated,
      ...(page.cursor ? { cursor: page.cursor } : {})
    }
  }

  const response = await getR2Client().send(new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: input.prefix,
    ContinuationToken: input.cursor,
    MaxKeys: limit
  }))
  const truncated = response.IsTruncated === true
  if (truncated && !response.NextContinuationToken) {
    throw new Error('R2 returned a truncated object list without a cursor')
  }
  return {
    objects: (response.Contents ?? []).flatMap(object => object.Key
      ? [{ key: object.Key, size: object.Size ?? 0, uploaded: object.LastModified }]
      : []),
    truncated,
    ...(response.NextContinuationToken ? { cursor: response.NextContinuationToken } : {})
  }
}

/**
 * Get public URL for a file (if R2_PUBLIC_URL is configured)
 */
export function getPublicUrl(key: string): string | null {
  if (!R2_PUBLIC_URL) return null
  return `${R2_PUBLIC_URL}/${key}`
}

/**
 * Check if R2 storage is configured
 */
export function isStorageConfigured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
}
