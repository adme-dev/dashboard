import { createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry, getTransactionFailureStage } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { bannerAssetDeliveryUrl, createBannerAssetId, createBannerAssetStorageKey, deleteBannerFile, uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from './assetDelivery'
import { validateBannerAssetUpload } from './assetUploadValidation'
import { boundedMotorstackCall, motorstackBrandId, readMotorstackAsset } from './motorstackClient'

export const mediaQuerySchema = z.object({ brandId: motorstackBrandId, model: z.string().trim().min(1).max(100).refine(value => [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)).optional() }).strict()
export const mediaSelectionSchema = mediaQuerySchema.extend({ assetId: z.string().regex(/^[a-f0-9]{64}$/) })
type Selection = z.infer<typeof mediaSelectionSchema>
interface MediaBinding {
  listMedia(input: z.infer<typeof mediaQuerySchema>): Promise<unknown>
  getMediaAsset(input: Selection): Promise<Response>
}
const assetSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().min(1).max(255), type: z.string().max(50), mime: z.string().max(100), importable: z.boolean() })
const catalogSchema = z.object({ schemaVersion: z.literal(1), brand: z.object({ id: motorstackBrandId, name: z.string().min(1).max(255) }), assets: z.array(assetSchema).max(500), models: z.array(z.string().max(180)).max(500), warnings: z.array(z.string().max(1000)).max(100) })
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }
export function mediaBinding(event: H3Event): MediaBinding {
  const binding = event.context.cloudflare?.env?.MOTORSTACK_BRAND_ASSETS as MediaBinding | undefined
  if (!binding || typeof binding.listMedia !== 'function' || typeof binding.getMediaAsset !== 'function') throw createError({ statusCode: 503, statusMessage: 'MotorStack media is not configured on this deployment' })
  return binding
}
export async function mediaCatalog(binding: MediaBinding, query: z.infer<typeof mediaQuerySchema>) {
  const result = catalogSchema.safeParse(await boundedMotorstackCall(binding.listMedia(query), 45000))
  if (!result.success || result.data.brand.id !== query.brandId || new Set(result.data.assets.map(asset => asset.id)).size !== result.data.assets.length) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid media metadata' })
  const warnings = [...result.data.warnings]
  if (result.data.assets.some(asset => !EXTENSIONS[asset.mime])) warnings.push('Some source files use formats not supported by this media picker and were omitted.')
  return { ...result.data, warnings, assets: result.data.assets.filter(asset => EXTENSIONS[asset.mime]).map(asset => ({ ...asset, importable: asset.importable && asset.mime.startsWith('image/'), previewUrl: `/api/agency/banner-studio/motorstack/file?${new URLSearchParams({ ...query, assetId: asset.id })}` })) }
}
export async function readMedia(binding: MediaBinding, input: Selection) {
  const catalog = await mediaCatalog(binding, { brandId: input.brandId, ...(input.model ? { model: input.model } : {}) })
  const asset = catalog.assets.find(asset => asset.id === input.assetId)
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'MotorStack media is no longer available' })
  const file = await readMotorstackAsset({ listBrands: async () => null, getBrandKit: async () => null, getBrandAsset: () => binding.getMediaAsset(input) }, input.brandId, input.assetId, 20 * 1024 * 1024)
  if (file.mimeType !== asset.mime) throw createError({ statusCode: 502, statusMessage: 'MotorStack media type changed; refresh the library' })
  const filename = `motorstack-${asset.name.replace(/[^\p{L}\p{N} ._-]/gu, '-').slice(0, 150)}.${EXTENSIONS[asset.mime]}`
  if (asset.mime === 'application/pdf') {
    if (file.bytes.subarray(0, 5).toString() !== '%PDF-') throw createError({ statusCode: 502, statusMessage: 'MotorStack document is invalid' })
  } else {
    try {
      validateBannerAssetUpload({ filename, type: asset.mime, data: file.bytes })
    } catch {
      throw createError({ statusCode: 502, statusMessage: 'MotorStack image is invalid or unsupported' })
    }
  }
  return { ...file, asset, filename }
}
export async function importMedia(event: H3Event, binding: MediaBinding, input: Selection, userId: string) {
  const file = await readMedia(binding, input)
  if (!file.asset.importable || !file.mimeType.startsWith('image/')) throw createError({ statusCode: 422, statusMessage: 'This file can be downloaded but cannot be added as an image' })
  const digest = createHash('sha256').update(file.bytes).digest('hex')
  const tags = ['motorstack', 'motorstack-media', `motorstack-brand:${input.brandId}`, `motorstack-asset:${input.assetId}`, `sha256:${digest}`]
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  let createdKey: string | undefined
  const columns = 'id, name, mime_type AS "mimeType", file_size AS "fileSize", r2_key AS "r2Key", url, thumbnail_url AS "thumbnailUrl", tags, uploaded_by AS "uploadedBy", client_id AS "clientId", created_at AS "createdAt"'
  try {
    return await transactionWithoutRetry(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`motorstack-media:${userId}:${input.assetId}:${digest}`])
      const existing = await db.query(`SELECT ${columns} FROM banner_assets WHERE uploaded_by = $1 AND client_id IS NULL AND tags @> $2::text[] ORDER BY created_at LIMIT 1`, [userId, tags])
      if (existing.rows[0]) return { asset: existing.rows[0] }
      const id = createBannerAssetId()
      const key = createBannerAssetStorageKey(file.filename, userId)
      const url = signingSecret ? await bannerAssetDeliveryUrl(id, getAppUrl(event), signingSecret) : undefined
      createdKey = key
      const stored = await uploadBannerAsset(file.bytes, file.filename, file.mimeType, userId, key, nativeUpload ? { bucket: nativeUpload.bucket, assetUrl: url! } : undefined, url)
      const row = await db.query(`INSERT INTO banner_assets (id,name,mime_type,file_size,r2_key,url,tags,uploaded_by,client_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL) RETURNING ${columns}`, [id, file.asset.name, file.mimeType, stored.size, stored.key, stored.url, tags, userId])
      if (!row.rows[0]) throw new Error('Media asset insert returned no row')
      return { asset: row.rows[0] }
    })
  } catch (error) {
    if (createdKey && getTransactionFailureStage(error) === 'definite_rollback') await deleteBannerFile(createdKey, nativeUpload?.bucket).catch(() => undefined)
    throw error
  }
}
