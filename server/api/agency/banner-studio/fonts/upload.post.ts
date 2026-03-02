import { readMultipartFormData } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'

const FONT_EXTENSIONS = new Set(['woff2', 'woff', 'ttf', 'otf'])

/** Derive a clean font-family name from a filename */
function deriveFontFamily(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '') // strip extension
    .replace(/[-_]/g, ' ')   // dashes/underscores → spaces
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
  const user = await requireAuth(event)

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

  const fileName = file.filename || 'unnamed.woff2'
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  // Validate font extension
  if (!FONT_EXTENSIONS.has(ext)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid font format: .${ext}. Supported: .woff2, .woff, .ttf, .otf`,
    })
  }

  const mimeType = file.type || 'application/octet-stream'

  // Max 5MB for fonts
  const buffer = Buffer.from(file.data)
  if (buffer.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 400, statusMessage: 'Font file too large (max 5MB)' })
  }

  const rawFamily = familyField?.data?.toString().trim() || deriveFontFamily(fileName)
  // Limit family name length
  const fontFamily = rawFamily.slice(0, 100)
  const rawWeight = parseInt(weightField?.data?.toString() || '400') || 400
  // Validate weight is 100-900 and multiple of 100
  const fontWeight = Math.min(900, Math.max(100, Math.round(rawWeight / 100) * 100))
  const fontFormat = fontFormatFromExt(ext)

  try {
    const { key, url, size } = await uploadBannerAsset(buffer, fileName, mimeType, user.id)

    // Store in banner_assets with font metadata as TEXT[] tags
    // Tags: ['font', 'weight:400', 'format:woff2'] — queryable via '= ANY(tags)'
    const tags = ['font', `weight:${fontWeight}`, `format:${fontFormat}`]

    const row = await queryOne(`
      INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id, name,
        mime_type AS "mimeType",
        file_size AS "fileSize",
        r2_key AS "r2Key",
        url, tags,
        uploaded_by AS "uploadedBy",
        created_at AS "createdAt"
    `, [
      fontFamily,
      mimeType,
      size,
      key,
      url,
      tags,
      user.id,
    ])

    return row
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to upload font:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload font' })
  }
})
