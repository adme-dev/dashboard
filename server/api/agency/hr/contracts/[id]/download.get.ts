import { createError, getRouterParam, send, setHeader } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { downloadHrContractFileBuffer } from '~~/server/utils/hr/contractStorage'

export default defineEventHandler(async (event) => {
  const user = await requireHrAdmin(event)
  const documentId = getRouterParam(event, 'id')
  if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid contract document' })
  const document = await queryOne<any>(
    `SELECT id, file_key, file_name, content_type FROM hr_contract_documents WHERE id = $1`,
    [documentId],
  )
  if (!document) throw createError({ statusCode: 404, statusMessage: 'Contract document not found' })
  await recordHrAuditEvent({ actorId: user.id, action: 'contract_document.downloaded', targetType: 'contract_document', targetId: document.id })

  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Content-Type', document.content_type)
  setHeader(event, 'Content-Disposition', `attachment; filename="${String(document.file_name).replace(/["\r\n]/g, '')}"`)
  return send(event, await downloadHrContractFileBuffer(document.file_key))
})
