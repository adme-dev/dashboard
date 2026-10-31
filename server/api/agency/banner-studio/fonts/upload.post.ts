import { readMultipartFormData } from 'h3'
import { transactionWithoutRetry, getTransactionFailureStage } from '~~/server/utils/db'
import { createHash } from 'node:crypto'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireBrandKitWriteAccess } from '~~/server/utils/banner/brandKitAccess'
import { FONT_ASSET_SELECT, fontAssetMetadata, type FontAssetRow } from '~~/server/utils/banner/fontAssets'
import { withBannerFontDelivery } from '~~/server/utils/banner/fontDelivery'
import { requireRole } from '~~/server/utils/auth'
import { uploadBannerAsset, createBannerAssetId, createBannerAssetStorageKey, bannerAssetDeliveryUrl, deleteBannerFile } from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { getAppUrl } from '~~/server/utils/appUrl'
import { bannerFontMimeType, isBannerFontBytes } from '~~/server/utils/banner/fontValidation'

const FONT_EXTENSIONS = new Set(['woff2', 'woff', 'ttf', 'otf'])

/** Derive a clean font-family name from a filename */
function deriveFontFamily(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '') // strip extension
    .replace(/[-_]/g, ' ') // dashes/underscores → spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → spaces
    .trim()
}

/** Determine the @font-face format string from extension */
function fontFormatFromExt(ext: string): string {
  switch (ext) {
    case 'woff2': return 'woff2'
    case 'woff': return 'woff'
    case 'ttf': return 'truetype'
    case 'otf': return 'opentype'
    default: return 'woff2'
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }

  // Optional custom font-family name
  const familyField = formData.find(f => f.name === 'family')
  const weightField = formData.find(f => f.name === 'weight')
  const clientField = formData.find(f => f.name === 'clientId')
  const clientId = clientField ? clientField.data.toString().trim().toLowerCase() : null
  if (clientField && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(clientId!)) throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
  await requireBrandKitWriteAccess(event, clientId)

  const fileName = file.filename || 'unnamed.woff2'
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  // Validate font extension
  if (!FONT_EXTENSIONS.has(ext)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid font format: .${ext}. Supported: .woff2, .woff, .ttf, .otf`
    })
  }

  const mimeType = bannerFontMimeType(fileName)!

  // Max 5MB for fonts
  const buffer = Buffer.from(file.data)
  if (buffer.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 400, statusMessage: 'Font file too large (max 5MB)' })
  }

  if (!isBannerFontBytes(buffer, fileName)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid font file bytes for its declared format' })
  }

  const rawFamily = familyField?.data?.toString().trim() || deriveFontFamily(fileName)
  // Limit family name length
  const fontFamily = rawFamily.slice(0, 100)
  // Keep imported face weights exact; rounding can select a different brand face.
  const rawWeight = weightField ? weightField.data.toString().trim() : '400'
  const fontWeight = Number(rawWeight)
  if (!/^\d+$/.test(rawWeight) || !Number.isInteger(fontWeight) || fontWeight < 1 || fontWeight > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'Font weight must be an integer from 1 to 1000' })
  }
  const fontFormat = fontFormatFromExt(ext)

  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const assetId = createBannerAssetId()
  const storageKey = createBannerAssetStorageKey(fileName, user.id)
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  const deliveryUrl = signingSecret ? await bannerAssetDeliveryUrl(assetId, getAppUrl(event), signingSecret) : undefined
  let stored = false
  try {
    const row = await transactionWithoutRetry(async (db) => {
      // Serialize equal uploads without a migration; the lock covers lookup and insert.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`banner-font:${clientId || 'shared'}:${fontFamily}:${fontWeight}:${sha256}`])
      const existing = await db.query<FontAssetRow>(`SELECT ${FONT_ASSET_SELECT} FROM banner_assets
        WHERE 'font' = ANY(tags) AND client_id IS NOT DISTINCT FROM $1::uuid AND name = $2
          AND $3 = ANY(tags) AND $4 = ANY(tags) ORDER BY created_at, id LIMIT 1 FOR SHARE`,
      [clientId, fontFamily, `weight:${fontWeight}`, `sha256:${sha256}`])
      if (existing.rows[0]) return existing.rows[0]
      const { key, url, size } = await uploadBannerAsset(buffer, fileName, mimeType, user.id, storageKey,
        nativeUpload ? { bucket: nativeUpload.bucket, assetUrl: deliveryUrl! } : undefined, deliveryUrl)
      stored = true
      const tags = ['font', `weight:${fontWeight}`, `format:${fontFormat}`, `sha256:${sha256}`]
      const result = await db.query<FontAssetRow>(`
        INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by, id, client_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${FONT_ASSET_SELECT}
      `, [fontFamily, mimeType, size, key, url, tags, user.id, assetId, clientId])
      if (!result.rows[0]) throw new Error('Font insert returned no row')
      return result.rows[0]
    })
    return fontAssetMetadata((await withBannerFontDelivery(event, [row]))[0]!)
  } catch (error) {
    if (stored && getTransactionFailureStage(error) === 'definite_rollback') await deleteBannerFile(storageKey, nativeUpload?.bucket).catch(() => {})
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to upload font:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload font' })
  }
})
