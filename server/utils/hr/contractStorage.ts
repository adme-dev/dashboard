/**
 * Restricted employment-document storage.
 *
 * This intentionally does not reuse the platform's general media bucket or its
 * public/local upload route. Production fails closed unless a dedicated private
 * bucket binding or dedicated S3-compatible credentials are configured.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { getCachedObjectBinding } from '~~/server/utils/email'

const LOCAL_CONTRACT_DIR = join(process.cwd(), 'server', 'private-uploads', 'hr-contracts')
const ACCOUNT_ID = process.env.HR_R2_ACCOUNT_ID || ''
const ACCESS_KEY_ID = process.env.HR_R2_ACCESS_KEY_ID || ''
const SECRET_ACCESS_KEY = process.env.HR_R2_SECRET_ACCESS_KEY || ''
const BUCKET_NAME = process.env.HR_R2_BUCKET_NAME || ''

interface PrivateR2Object {
  arrayBuffer: () => Promise<ArrayBuffer>
}

interface PrivateR2Bucket {
  put: (key: string, value: Uint8Array, options?: {
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  }) => Promise<unknown>
  get: (key: string) => Promise<PrivateR2Object | null>
  delete: (key: string) => Promise<void>
}

function getNativeBucket(): PrivateR2Bucket | undefined {
  return getCachedObjectBinding<PrivateR2Bucket>('HR_CONTRACTS_BUCKET')
}

function hasDedicatedS3Config(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET_NAME)
}

function getClient(): S3Client {
  if (!hasDedicatedS3Config()) throw new Error('Dedicated HR contract storage is not configured')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    requestHandler: new FetchHttpHandler(),
  })
}

function localPath(key: string): string {
  const safeKey = key.replace(/^\/+/, '')
  if (safeKey.includes('..')) throw new Error('Invalid HR contract storage key')
  return join(LOCAL_CONTRACT_DIR, safeKey)
}

function allowLocalStorage(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export function isHrContractStorageConfigured(): boolean {
  return Boolean(getNativeBucket() || hasDedicatedS3Config() || allowLocalStorage())
}

export async function uploadHrContractFile(
  buffer: Buffer,
  key: string,
  contentType: string,
  metadata: Record<string, string>,
): Promise<{ key: string; size: number }> {
  const bytes = new Uint8Array(buffer)
  const nativeBucket = getNativeBucket()
  if (nativeBucket) {
    await nativeBucket.put(key, bytes, {
      httpMetadata: { contentType },
      customMetadata: metadata,
    })
    return { key, size: buffer.length }
  }
  if (hasDedicatedS3Config()) {
    await getClient().send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ContentLength: bytes.byteLength,
      Metadata: metadata,
    }))
    return { key, size: buffer.length }
  }
  if (!allowLocalStorage()) throw new Error('Dedicated HR contract storage is not configured')
  const path = localPath(key)
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, buffer, { mode: 0o600 })
  return { key, size: buffer.length }
}

export async function downloadHrContractFileBuffer(key: string): Promise<Buffer> {
  const nativeBucket = getNativeBucket()
  if (nativeBucket) {
    const object = await nativeBucket.get(key)
    if (!object) throw new Error('Contract document not found in private storage')
    return Buffer.from(await object.arrayBuffer())
  }
  if (hasDedicatedS3Config()) {
    const response = await getClient().send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
    const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!body?.transformToByteArray) throw new Error('Private contract response body is not readable')
    return Buffer.from(await body.transformToByteArray())
  }
  if (!allowLocalStorage()) throw new Error('Dedicated HR contract storage is not configured')
  return fs.readFile(localPath(key))
}

export async function deleteHrContractFile(key: string): Promise<void> {
  const nativeBucket = getNativeBucket()
  if (nativeBucket) {
    await nativeBucket.delete(key)
    return
  }
  if (hasDedicatedS3Config()) {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
    return
  }
  if (!allowLocalStorage()) throw new Error('Dedicated HR contract storage is not configured')
  await fs.unlink(localPath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}
