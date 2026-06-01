// server/api/client-portal/crm/documents/[id]/download.get.ts — session-scoped signed download.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getDocument } from '~~/server/utils/crm/documentsDb'
import { getPresignedDownloadUrl } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const doc = await getDocument(id, client.clientId)
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const url = await getPresignedDownloadUrl(doc.file_key, 300)
  return sendRedirect(event, url, 302)
})
