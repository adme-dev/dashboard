// server/api/crm/documents/[id]/download.get.ts — redirect to a short-lived signed URL.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { getDocument } from '~~/server/utils/crm/documentsDb'
import { getPresignedDownloadUrl } from '~~/server/utils/storage'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  const doc = await getDocument(id, q.client_id) // client-scoped — cross-client returns null
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const url = await getPresignedDownloadUrl(doc.file_key, 300)
  return sendRedirect(event, url, 302)
})
