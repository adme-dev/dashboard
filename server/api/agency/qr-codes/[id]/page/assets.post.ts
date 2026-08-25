/** Upload a hero or logo image for a hosted page. POST multipart: file, kind=hero|logo. */
import { queryOne } from '~~/server/utils/db'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { assetPublicPath } from '~~/server/utils/qr/pages'
import { uploadFile, generateStorageKey } from '~~/server/utils/storage'

const MAX = 2 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

export default defineEventHandler(async (event) => {
  const { user, row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const page = await queryOne<{ id: string }>(`SELECT id FROM qr_pages WHERE qr_code_id = $1`, [row.id])
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Save the page before adding images' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.data?.length)
  const kind = parts?.find(p => p.name === 'kind')?.data?.toString('utf8')
  if (!file) throw createError({ statusCode: 400, statusMessage: 'file is required' })
  if (kind !== 'hero' && kind !== 'logo') throw createError({ statusCode: 400, statusMessage: 'kind must be hero or logo' })
  const ext = TYPES[file.type ?? '']
  if (!ext) throw createError({ statusCode: 400, statusMessage: 'Image must be PNG, JPEG, WebP or SVG' })
  if (file.data.length > MAX) throw createError({ statusCode: 400, statusMessage: 'Image must be under 2 MB' })
  if (ext === 'svg' && /<script|on\w+=|<foreignObject/i.test(file.data.toString('utf8'))) throw createError({ statusCode: 400, statusMessage: 'SVG may not contain scripts' })

  const key = generateStorageKey('media-image', `${kind}.${ext}`, `qr-pages/${page.id}`)
  const stored = await uploadFile(file.data, key, file.type!, { pageId: page.id, kind })
  const asset = await executeQrMutation(event, 'page-asset-upload', async (db) => {
    const r = await db.query(
      `INSERT INTO qr_page_assets (page_id, kind, storage_key, content_type, size_bytes, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [page.id, kind, stored.key, file.type, stored.size, user.id])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_page_assets WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed asset no longer exists')
    return r.rows[0]
  })
  return { asset: { id: asset.id, kind, url: assetPublicPath(page.id, asset.id) } }
})
