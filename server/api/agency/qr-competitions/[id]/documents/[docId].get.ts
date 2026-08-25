/** Download a vault document (staff only). */
import { queryOne } from '~~/server/utils/db'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'
import { readStoredObject } from '~~/server/utils/storage'
import { isUuid } from '~~/server/utils/client-access'

export default defineEventHandler(async (event) => {
  const { row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const docId = getRouterParam(event, 'docId')
  if (!isUuid(docId)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const doc = await queryOne<any>(`SELECT * FROM qr_competition_documents WHERE id = $1 AND competition_id = $2 AND deleted_at IS NULL`, [docId, row.id])
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const obj = await readStoredObject(doc.storage_key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'File missing from storage' })
  setResponseHeaders(event, {
    'Content-Type': doc.content_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${getQuery(event).inline === '1' ? 'inline' : 'attachment'}; filename="${doc.title.replace(/[^\w.\- ]/g, '_')}"`,
    'X-Document-SHA256': doc.sha256
  })
  return obj.body
})
