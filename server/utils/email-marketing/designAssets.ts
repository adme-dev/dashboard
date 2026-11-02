import { z } from 'zod'
import type { H3Event } from 'h3'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { isStorageConfigured, readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'
import { isBannerAssetDeliveryKey } from '~~/server/utils/bannerStorage'
import { detectBannerAssetMime } from '../../../shared/utils/bannerAssetIdentity'
import type { EmailDesignDocument } from '../../../shared/emailRendering/designContract'
import { DesignModuleError, designDigest, stableDesignJson } from '../../../shared/emailRendering/designModules'
import type { DesignDb, DesignTransaction } from './designRevisions'

export type PublishedEmailAsset = EmailDesignDocument['assets'][number]
export const AssetPublicationRequest = z.object({ version: z.literal(1), operationId: z.string().uuid(), assetId: z.string().uuid() }).strict()
export interface DesignAssetStorage {
  read(key: string): Promise<Uint8Array>
  url(assetId: string): Promise<string>
  identifyUrl(url: string): Promise<string | null>
}
/** Existing signed delivery is publicly readable by token, including uploads
 * before this publication. This adapter claims no private staging boundary. */
export function createDesignAssetStorage(event: H3Event, appOrigin: string): DesignAssetStorage {
  const cloudflare = event.context.cloudflare
  const bucket = cloudflare?.env?.MEDIA_BUCKET as R2BucketBinding | undefined
  if (cloudflare ? typeof bucket?.get !== 'function' : !isStorageConfigured()) throw new DesignModuleError('ASSET_STORAGE_UNAVAILABLE')
  const origin = new URL(appOrigin).origin
  const canonicalUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.length > 1024) return null
    try {
      const url = new URL(value)
      if (url.origin !== origin || url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) return null
      return /^\/api\/public\/banner-assets\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.pathname) ? value : null
    } catch { return null }
  }
  return {
    // The upload owner already signed this exact URL and stored it with the
    // registered row. Reuse that immutable authority; this read service neither
    // receives the Pages signing secret nor mints a parallel delivery token.
    url: async (id) => {
      const row = await queryOneFresh<{ url: string }>('SELECT url FROM banner_assets WHERE id=$1 AND email_publication IS NOT NULL', [id])
      const url = canonicalUrl(row?.url)
      if (!url) throw new DesignModuleError('ASSET_NOT_READY')
      return url
    },
    identifyUrl: async (value) => {
      if (!canonicalUrl(value)) return null
      const row = await queryOneFresh<{ id: string }>('SELECT id FROM banner_assets WHERE url=$1 AND email_publication IS NOT NULL', [value])
      return row?.id ?? null
    },
    read: async (key) => {
      // Avoid local-file fallback on hosted requests; use the actual request binding.
      const object = bucket ? await bucket.get!(key) : await readStoredObject(key)
      if (!object || object.size <= 0 || object.size > 10 * 1024 * 1024) throw new DesignModuleError('ASSET_NOT_READY')
      const reader = object.body.getReader()
      const parts: Uint8Array[] = []
      let bytes = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DesignModuleError('ASSET_STORAGE_UNAVAILABLE')), 15_000)
      })
      try {
        while (true) {
          const next = await Promise.race([reader.read(), timeout])
          if (next.done) break
          bytes += next.value.byteLength
          if (bytes > object.size || bytes > 10 * 1024 * 1024) throw new DesignModuleError('ASSET_NOT_READY')
          parts.push(next.value)
        }
      } finally {
        clearTimeout(timer)
        void reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      if (bytes !== object.size) throw new DesignModuleError('ASSET_NOT_READY')
      const result = new Uint8Array(bytes)
      let offset = 0
      for (const part of parts) {
        result.set(part, offset)
        offset += part.byteLength
      }
      return result
    }
  }
}
/** Bounded header inspection, not an image decoder or malware certificate. */
export async function describeEmailAsset(id: string, bytes: Uint8Array): Promise<PublishedEmailAsset> {
  const mimeType = detectBannerAssetMime(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0, height = 0
  if (mimeType === 'image/png' && bytes.length >= 24 && new TextDecoder().decode(bytes.slice(12, 16)) === 'IHDR') {
    width = view.getUint32(16)
    height = view.getUint32(20)
  } else if (mimeType === 'image/gif' && bytes.length >= 10) {
    width = view.getUint16(6, true)
    height = view.getUint16(8, true)
  } else if (mimeType === 'image/jpeg') {
    let offset = 2
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) break
      while (bytes[offset] === 0xff) offset++
      if (offset >= bytes.length) break
      const marker = bytes[offset++]!
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        height = view.getUint16(offset + 3)
        width = view.getUint16(offset + 5)
        break
      }
      offset += length
    }
  }
  if (!['image/png', 'image/jpeg', 'image/gif'].includes(mimeType ?? '') || bytes.length === 0 || bytes.length > 10 * 1024 * 1024 || width < 1 || height < 1 || width > 10000 || height > 10000) throw new DesignModuleError('ASSET_NOT_READY')
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))), b => b.toString(16).padStart(2, '0')).join('')
  return { id, sha256, mimeType: mimeType as PublishedEmailAsset['mimeType'], bytes: bytes.length, width, height }
}
export type AssetRow = { id: string, client_id: string | null, uploaded_by: string, r2_key: string, file_size: number, mime_type: string, email_publication: PublishedEmailAsset | null }
async function assetRow(db: DesignDb, assetId: string): Promise<AssetRow> {
  const row = (await db.query('SELECT * FROM banner_assets WHERE id=$1 FOR UPDATE', [assetId])).rows[0] as AssetRow | undefined
  if (!row || !isBannerAssetDeliveryKey(row.r2_key, row.uploaded_by)) throw new DesignModuleError('NOT_FOUND')
  return row
}
async function verifiedDescriptor(row: AssetRow, storage: DesignAssetStorage): Promise<PublishedEmailAsset> {
  const descriptor = await describeEmailAsset(row.id, await storage.read(row.r2_key))
  if (row.file_size !== descriptor.bytes || row.mime_type !== descriptor.mimeType) throw new DesignModuleError('ASSET_NOT_READY')
  return descriptor
}
export async function publishEmailAsset(input: unknown, actorId: string, authorizePublisher: (scope: string | null) => Promise<void>, storage: DesignAssetStorage, transaction: DesignTransaction = cb => transactionWithoutRetry(db => cb(db))) {
  z.string().uuid().parse(actorId)
  const request = AssetPublicationRequest.parse(input)
  const digest = await designDigest({ boundary: 'email-asset-publication-v1', request })
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${actorId}:${request.operationId}`])
    const row = await assetRow(db, request.assetId)
    await authorizePublisher(row.client_id)
    const prior = (await db.query('SELECT asset_id, payload_sha256, descriptor FROM email_asset_publication_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, request.operationId])).rows[0] as { asset_id: string, payload_sha256: string, descriptor: PublishedEmailAsset } | undefined
    if (prior) {
      if (prior.asset_id !== row.id || prior.payload_sha256 !== digest) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
      return { asset: prior.descriptor }
    }
    const descriptor = await verifiedDescriptor(row, storage)
    if (row.email_publication && stableDesignJson(row.email_publication) !== stableDesignJson(descriptor)) throw new DesignModuleError('ASSET_NOT_READY')
    await authorizePublisher(row.client_id)
    await db.query('UPDATE banner_assets SET email_publication=$2::jsonb WHERE id=$1', [row.id, JSON.stringify(descriptor)])
    await db.query('INSERT INTO email_asset_publication_receipts(actor_id,operation_id,asset_id,payload_sha256,descriptor) VALUES ($1,$2,$3,$4,$5::jsonb)', [actorId, request.operationId, row.id, digest, JSON.stringify(descriptor)])
    return { asset: descriptor }
  })
}
export async function readPublishedEmailAsset(assetId: string, scope: string | null, db: DesignDb, authorizeRead: (scope: string | null) => Promise<void>, storage: DesignAssetStorage) {
  const row = await assetRow(db, assetId)
  await authorizeRead(row.client_id)
  if (row.client_id !== null && row.client_id !== scope) throw new DesignModuleError('SCOPE_MISMATCH')
  if (!row.email_publication) throw new DesignModuleError('ASSET_NOT_READY')
  const descriptor = await verifiedDescriptor(row, storage)
  if (stableDesignJson(descriptor) !== stableDesignJson(row.email_publication)) throw new DesignModuleError('ASSET_NOT_READY')
  return { asset: descriptor, url: await storage.url(row.id) }
}
/** Only native structured image blocks have a verified image reference mapping.
 * Locked legacy/custom HTML must be explicitly adapted before publication. */
export async function verifyDesignModuleAssets(design: EmailDesignDocument, db: DesignDb, authorizeRead: (scope: string | null) => Promise<void>, storage?: DesignAssetStorage): Promise<PublishedEmailAsset[]> {
  const allowed = new Set(['Heading', 'Text', 'Button', 'Image', 'Avatar', 'Spacer', 'Divider', 'Container', 'ColumnsContainer', 'EmailLayout'])
  const assets = new Map<string, PublishedEmailAsset>()
  for (const block of Object.values(design.blocks)) {
    if (!allowed.has(block.type)) throw new DesignModuleError('ASSET_NOT_READY')
    // Background/native image effects have no verified mapping in this boundary.
    const data = stableDesignJson(block.data)
    if (/backgroundImage|background-image|data:|blob:|figcraft:|asset:\/\//i.test(data)) throw new DesignModuleError('ASSET_NOT_READY')
    if (block.type !== 'Image' && block.type !== 'Avatar') continue
    if (!storage) throw new DesignModuleError('ASSET_STORAGE_UNAVAILABLE')
    const url = block.data.props?.url
    const id = typeof url === 'string' ? await storage.identifyUrl(url) : null
    if (!id) throw new DesignModuleError('ASSET_NOT_READY')
    const verified = await readPublishedEmailAsset(id, design.scope.clientId, db, authorizeRead, storage)
    // The persisted URL must equal canonical signed delivery; no URL fetching.
    if (url !== verified.url) throw new DesignModuleError('ASSET_NOT_READY')
    assets.set(id, verified.asset)
  }
  return [...assets.values()]
}
