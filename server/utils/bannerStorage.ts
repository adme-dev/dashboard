import { uploadFile, deleteFile } from '~~/server/utils/storage'
import type { R2BucketBinding } from '~~/server/utils/storage'

const randomUUID = () => globalThis.crypto.randomUUID()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_PART = /^[A-Za-z0-9_-]+$/
const TOKEN_VERSION = 'v1'
const TOKEN_DOMAIN = 'xeroflow:banner-asset:v1:'
const MINIMUM_SECRET_BYTES = 32

export interface NativeBannerAssetUpload {
  bucket: R2BucketBinding
  assetUrl: string
}

export function createBannerAssetId(): string {
  return randomUUID()
}

function assertSigningSecret(secret: string): void {
  if (new TextEncoder().encode(secret).byteLength < MINIMUM_SECRET_BYTES) {
    throw new Error('Banner asset link signing secret is unavailable or too short')
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !TOKEN_PART.test(value)) return null
  const padding = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function tokenSignature(body: string, secret: string): Promise<Uint8Array> {
  assertSigningSecret(secret)
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${TOKEN_DOMAIN}${body}`)
  ))
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

export async function signBannerAssetToken(assetId: string, secret: string): Promise<string> {
  if (!UUID.test(assetId)) throw new Error('Banner asset id must be a UUID')
  const body = encodeBase64Url(new TextEncoder().encode(assetId.toLowerCase()))
  const signature = encodeBase64Url(await tokenSignature(body, secret))
  return `${TOKEN_VERSION}.${body}.${signature}`
}

export async function verifyBannerAssetToken(
  token: string,
  secret: string
): Promise<{ version: 1, assetId: string } | null> {
  try {
    assertSigningSecret(secret)
  } catch {
    return null
  }
  if (token.length > 256) return null
  const [version, body, signature, extra] = token.split('.')
  if (version !== TOKEN_VERSION || !body || !signature || extra !== undefined) return null

  const bodyBytes = decodeBase64Url(body)
  const signatureBytes = decodeBase64Url(signature)
  if (!bodyBytes || !signatureBytes) return null
  const assetId = new TextDecoder().decode(bodyBytes)
  if (!UUID.test(assetId)) return null

  const expected = await tokenSignature(body, secret)
  return equalBytes(expected, signatureBytes)
    ? { version: 1, assetId: assetId.toLowerCase() }
    : null
}

export async function bannerAssetDeliveryUrl(assetId: string, baseUrl: string, secret: string): Promise<string> {
  const origin = new URL(baseUrl)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('Banner asset application URL is invalid')
  }
  const token = await signBannerAssetToken(assetId, secret)
  return `${origin.origin}/api/public/banner-assets/${token}`
}

export function isBannerAssetDeliveryKey(key: string, uploaderId: string): boolean {
  if (!UUID.test(uploaderId)) return false
  const prefix = `banner-assets/${uploaderId.toLowerCase()}/`
  if (!key.toLowerCase().startsWith(prefix)) return false
  const remainder = key.slice(prefix.length)
  const separator = remainder.indexOf('/')
  if (separator < 1 || separator !== remainder.lastIndexOf('/')) return false
  const objectId = remainder.slice(0, separator)
  const fileName = remainder.slice(separator + 1)
  return UUID.test(objectId)
    && fileName.length > 0
    && fileName.length <= 255
    && fileName !== '.'
    && fileName !== '..'
    && !fileName.includes('\\')
    && !containsControlCharacter(fileName)
}

export function createBannerAssetStorageKey(fileName: string, userId: string): string {
  return `banner-assets/${userId}/${randomUUID()}/${fileName}`
}

function isExpectedBannerAssetStorageKey(key: string, fileName: string, userId: string): boolean {
  const prefix = `banner-assets/${userId}/`
  if (!key.startsWith(prefix) || !key.endsWith(`/${fileName}`)) return false
  const objectId = key.slice(prefix.length, -(fileName.length + 1))
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)
}

export async function uploadBannerAsset(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
  precomputedKey = createBannerAssetStorageKey(fileName, userId),
  nativeUpload?: NativeBannerAssetUpload
): Promise<{ key: string, url: string, size: number }> {
  if (!isExpectedBannerAssetStorageKey(precomputedKey, fileName, userId)) {
    throw new Error('Invalid precomputed banner asset storage key')
  }
  if (!nativeUpload) return uploadFile(buffer, precomputedKey, mimeType)
  if (!isBannerAssetDeliveryKey(precomputedKey, userId)) {
    throw new Error('Invalid native banner asset storage scope')
  }

  const assetUrl = new URL(nativeUpload.assetUrl)
  if (!['https:', 'http:'].includes(assetUrl.protocol)
    || assetUrl.username
    || assetUrl.password
    || assetUrl.search
    || assetUrl.hash
    || !/^\/api\/public\/banner-assets\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assetUrl.pathname)) {
    throw new Error('Invalid Banner Studio asset delivery URL')
  }

  const bytes = new Uint8Array(buffer)
  await nativeUpload.bucket.put(precomputedKey, bytes, {
    httpMetadata: { contentType: mimeType }
  })
  const stored = await nativeUpload.bucket.head(precomputedKey)
  if (!stored || stored.size !== bytes.byteLength) {
    throw new Error('R2 write failed: object not persisted after native put')
  }
  return { key: precomputedKey, url: assetUrl.toString(), size: bytes.byteLength }
}

export async function uploadBannerExport(
  buffer: Buffer,
  projectId: string,
  _fileName: string
): Promise<{ key: string, url: string, size: number }> {
  const uuid = randomUUID()
  const key = `banner-exports/${projectId}/${uuid}.zip`
  return uploadFile(buffer, key, 'application/zip')
}

export async function uploadBannerThumbnail(
  buffer: Buffer,
  projectId: string
): Promise<{ key: string, url: string, size: number }> {
  const key = `banner-thumbnails/${projectId}.png`
  return uploadFile(buffer, key, 'image/png')
}

export async function deleteBannerFile(r2Key: string): Promise<void> {
  return deleteFile(r2Key)
}
