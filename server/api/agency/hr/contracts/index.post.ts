import { createHash, randomUUID } from 'node:crypto'
import { createError, readMultipartFormData, setHeader } from 'h3'
import { queryOne, transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { deleteHrContractFile, isHrContractStorageConfigured, uploadHrContractFile } from '~~/server/utils/hr/contractStorage'

const MAX_CONTRACT_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function extensionFor(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  return ['pdf', 'doc', 'docx'].includes(extension) ? extension : ''
}

function hasExpectedSignature(data: Buffer, extension: string): boolean {
  if (extension === 'pdf') return data.subarray(0, 5).toString() === '%PDF-'
  if (extension === 'docx') return data[0] === 0x50 && data[1] === 0x4b
  if (extension === 'doc') return data.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1'
  return false
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const form = await readMultipartFormData(event)
  if (!form?.length) throw createError({ statusCode: 400, statusMessage: 'No contract uploaded' })
  const file = form.find(part => part.name === 'file')
  const teamMemberId = form.find(part => part.name === 'teamMemberId')?.data?.toString().trim()
  const effectiveFrom = form.find(part => part.name === 'effectiveFrom')?.data?.toString().trim() || null

  if (!file?.data || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Contract file is required' })
  const fileName = file.filename
  if (!teamMemberId || !/^[0-9a-f-]{36}$/i.test(teamMemberId)) throw createError({ statusCode: 400, statusMessage: 'A valid team member is required' })
  const member = await queryOne<{ id: string; name: string }>('SELECT id, name FROM team_members WHERE id = $1 AND is_active = true', [teamMemberId])
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Active team member not found' })

  const contentType = file.type || 'application/octet-stream'
  const extension = extensionFor(fileName)
  if (!ALLOWED_TYPES.has(contentType) || !extension || !hasExpectedSignature(file.data, extension)) {
    throw createError({ statusCode: 400, statusMessage: 'Only genuine PDF, DOC and DOCX employment documents are accepted' })
  }
  if (file.data.length > MAX_CONTRACT_BYTES) throw createError({ statusCode: 413, statusMessage: 'Contract file must be 15 MB or smaller' })

  const checksum = createHash('sha256').update(file.data).digest('hex')
  const duplicate = await queryOne<{ id: string }>(
    'SELECT id FROM hr_contract_documents WHERE team_member_id = $1 AND checksum_sha256 = $2',
    [teamMemberId, checksum],
  )
  if (duplicate) throw createError({ statusCode: 409, statusMessage: 'This contract version has already been uploaded for the team member' })

  const key = `hr-contracts/${teamMemberId}/${Date.now()}-${randomUUID()}.${extension}`
  if (!isHrContractStorageConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Private contract storage is not configured' })
  }
  await uploadHrContractFile(file.data, key, contentType, {
    classification: 'restricted-hr-contract',
    teamMemberId,
    uploadedBy: user.id,
  })

  try {
    const document = await transaction(async (db) => {
      const documentResult = await db.query(
        `INSERT INTO hr_contract_documents
        (team_member_id, version, file_key, file_name, content_type, size_bytes,
         checksum_sha256, status, effective_from, retention_review_at, uploaded_by)
       SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3, $4, $5, $6,
              'review_required', $7::date, CURRENT_DATE + INTERVAL '7 years', $8
       FROM hr_contract_documents WHERE team_member_id = $1
       RETURNING id, team_member_id, version, file_name, status, retention_review_at, created_at`,
        [teamMemberId, key, fileName.slice(0, 255), contentType, file.data.length, checksum, effectiveFrom, user.id],
      )
      const inserted = documentResult.rows[0]
      await db.query(
        `UPDATE hr_contract_documents SET status = 'superseded', updated_at = NOW()
       WHERE team_member_id = $1 AND id <> $2 AND status IN ('uploaded', 'review_required', 'approved')`,
        [teamMemberId, inserted.id],
      )
      await recordHrAuditEvent({
        actorId: user.id,
        action: 'contract_document.uploaded',
        targetType: 'contract_document',
        targetId: inserted.id,
        metadata: { teamMemberId, version: inserted.version, contentType, sizeBytes: file.data.length },
      }, db)
      return inserted
    })
    return { ok: true, document }
  } catch (error) {
    await deleteHrContractFile(key).catch(() => {})
    throw error
  }
})
