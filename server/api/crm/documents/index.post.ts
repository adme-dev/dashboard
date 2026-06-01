// server/api/crm/documents/index.post.ts — multipart upload of a document onto a record.
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { createDocument } from '~~/server/utils/crm/documentsDb'
import type { DocTarget } from '~~/server/utils/crm/documents'
import {
  isStorageConfigured, uploadFile, generateStorageKey,
  validateFileType, validateFileSize, getMaxFileSize, getAllowedTypes,
} from '~~/server/utils/storage'

const TARGET_TABLE: Record<DocTarget, string> = {
  person: 'crm_people', company: 'crm_companies', opportunity: 'crm_opportunities',
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  if (!isStorageConfigured()) throw createError({ statusCode: 503, statusMessage: 'File storage is not configured' })

  const form = await readMultipartFormData(event)
  if (!form?.length) throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  const field = (n: string) => form.find(f => f.name === n)?.data?.toString().trim() || ''
  const file = form.find(f => f.name === 'file')
  const clientId = field('client_id')
  const targetType = field('target_type') as DocTarget
  const targetId = field('target_id')
  const documentType = field('document_type') || null
  const expiresAt = field('expires_at') || null

  if (!file) throw createError({ statusCode: 400, statusMessage: 'File is required' })
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^[0-9a-f-]{36}$/i.test(targetId)) throw createError({ statusCode: 400, statusMessage: 'Invalid client_id/target_id' })
  if (!TARGET_TABLE[targetType]) throw createError({ statusCode: 400, statusMessage: 'Invalid target_type' })

  // The target record must belong to this client (prevents cross-tenant attach).
  const target = await queryOne(
    `SELECT id FROM ${TARGET_TABLE[targetType]} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [targetId, clientId],
  )
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Target record not found' })

  const fileName = file.filename || 'document'
  const fileType = file.type || 'application/octet-stream'
  const fileSize = file.data.length
  if (!validateFileType(fileType, 'attachments')) {
    throw createError({ statusCode: 400, statusMessage: `Invalid file type. Allowed: ${getAllowedTypes('attachments').join(', ')}` })
  }
  if (!validateFileSize(fileSize, 'attachments')) {
    throw createError({ statusCode: 400, statusMessage: `File too large (max ${Math.round(getMaxFileSize('attachments') / 1024 / 1024)}MB)` })
  }

  const key = generateStorageKey('attachments', fileName, `crm-${targetId}`)
  await uploadFile(file.data, key, fileType, { clientId, targetType, targetId, originalName: fileName })

  const row = await createDocument({
    clientId, targetType, targetId, fileKey: key, fileName, contentType: fileType,
    sizeBytes: fileSize, documentType, expiresAt, uploadedBy: user.id,
  })
  return { item: row }
})
