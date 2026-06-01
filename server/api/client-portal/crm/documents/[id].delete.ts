// server/api/client-portal/crm/documents/[id].delete.ts — session-scoped delete.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { softDeleteDocument } from '~~/server/utils/crm/documentsDb'
import { deleteFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const fileKey = await softDeleteDocument(id, client.clientId)
  if (!fileKey) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  try { await deleteFile(fileKey) } catch (e) { console.error('[crm] R2 delete failed', e) }
  return { ok: true }
})
