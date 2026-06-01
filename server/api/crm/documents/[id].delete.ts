// server/api/crm/documents/[id].delete.ts — soft-delete + remove the R2 object.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { softDeleteDocument } from '~~/server/utils/crm/documentsDb'
import { deleteFile } from '~~/server/utils/storage'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  const fileKey = await softDeleteDocument(id, q.client_id)
  if (!fileKey) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  try { await deleteFile(fileKey) } catch (e) { console.error('[crm] R2 delete failed', e) }
  return { ok: true }
})
