/** Public image delivery for hosted pages. UUID pair is the capability; served with long cache. */
import { queryOne } from '~~/server/utils/db'
import { readStoredObject } from '~~/server/utils/storage'

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const pageId = getRouterParam(event, 'pageId') ?? ''
  const assetId = getRouterParam(event, 'assetId') ?? ''
  if (!UUID.test(pageId) || !UUID.test(assetId)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const row = await queryOne<{ storage_key: string, content_type: string }>(
    `SELECT storage_key, content_type FROM qr_page_assets WHERE id = $1 AND page_id = $2`, [assetId, pageId])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const obj = await readStoredObject(row.storage_key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setResponseHeaders(event, {
    'Content-Type': row.content_type,
    'Cache-Control': 'public, max-age=86400, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\''
  })
  return obj.body
})
