// server/utils/crm/documentsDb.ts
// F13 — crm_documents persistence. R2 object I/O is handled by the caller via
// server/utils/storage.ts; this layer owns the metadata rows + client scoping.
import { queryRows, queryOne, transaction } from '~~/server/utils/db'
import type { DocTarget } from '~~/server/utils/crm/documents'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess, type TransactionClient } from '~~/server/utils/crm/recordAccess'

export interface CrmDocumentRow {
  id: string
  client_id: string
  target_type: DocTarget
  target_id: string
  file_key: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  document_type: string | null
  expires_at: string | null
  uploaded_by: string | null
  created_at: string
}

export async function listDocuments(scope: string | CrmSearchContext, target: DocTarget, targetId: string): Promise<CrmDocumentRow[]> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  if (typeof scope !== 'string') await requireCrmRecordAccess(scope, { type: target, id: targetId })
  return await queryRows<CrmDocumentRow>(
    `SELECT d.*, u.name AS uploaded_by_name
       FROM crm_documents d
       LEFT JOIN team_members u ON u.id = d.uploaded_by
      WHERE d.client_id = $1 AND d.target_type = $2 AND d.target_id = $3 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC`,
    [clientId, target, targetId],
  )
}

export async function createDocument(input: {
  context?: CrmSearchContext
  clientId: string, targetType: DocTarget, targetId: string,
  fileKey: string, fileName: string, contentType?: string | null, sizeBytes?: number | null,
  documentType?: string | null, expiresAt?: string | null, uploadedBy?: string | null,
}): Promise<CrmDocumentRow> {
  if (input.context) {
    return await transaction(async (db) => {
      await requireCrmRecordAccess(input.context!, { type: input.targetType, id: input.targetId }, db)
      const result = await db.query(
        `INSERT INTO crm_documents
           (client_id, target_type, target_id, file_key, file_name, content_type, size_bytes, document_type, expires_at, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [input.context!.clientId, input.targetType, input.targetId, input.fileKey, input.fileName,
          input.contentType ?? null, input.sizeBytes ?? null, input.documentType ?? null,
          input.expiresAt ?? null, input.uploadedBy ?? null]
      )
      const row = result.rows[0] as CrmDocumentRow | undefined
      if (!row) throw createError({ statusCode: 500, statusMessage: 'Failed to record document' })
      return row
    })
  }
  const row = await queryOne<CrmDocumentRow>(
    `INSERT INTO crm_documents
       (client_id, target_type, target_id, file_key, file_name, content_type, size_bytes, document_type, expires_at, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.clientId, input.targetType, input.targetId, input.fileKey, input.fileName,
      input.contentType ?? null, input.sizeBytes ?? null, input.documentType ?? null,
      input.expiresAt ?? null, input.uploadedBy ?? null,
    ],
  )
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Failed to record document' })
  return row
}

/** Fetch a single document, client-scoped (returns null if it belongs to another client). */
export async function getDocument(id: string, scope: string | CrmSearchContext): Promise<CrmDocumentRow | null> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  const row = await queryOne<CrmDocumentRow>(
    `SELECT * FROM crm_documents WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, clientId],
  )
  if (!row || typeof scope === 'string') return row
  await requireCrmRecordAccess(scope, { type: row.target_type, id: row.target_id })
  return row
}

/** Soft-delete + return the file_key so the caller can remove the R2 object. */
export async function softDeleteDocument(id: string, scope: string | CrmSearchContext): Promise<string | null> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  if (typeof scope !== 'string') {
    return await transaction(async (db: TransactionClient) => {
      const loaded = await db.query(
        `SELECT * FROM crm_documents WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, clientId]
      )
      const document = loaded.rows?.[0] as CrmDocumentRow | undefined
      if (!document) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
      await requireCrmRecordAccess(scope, { type: document.target_type, id: document.target_id }, db)
      const result = await db.query(
        `UPDATE crm_documents SET deleted_at = now()
          WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING file_key`,
        [id, clientId]
      )
      return (result.rows?.[0] as { file_key?: string } | undefined)?.file_key ?? null
    })
  }
  const row = await queryOne<{ file_key: string }>(
    `UPDATE crm_documents SET deleted_at = now()
      WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL
      RETURNING file_key`,
    [id, clientId],
  )
  return row?.file_key ?? null
}
