import { createError, getRouterParam, readBody, setHeader } from 'h3'
import { queryOne, transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrContractRoleExtractSchema } from '~~/server/utils/hr/schemas'

const OMITTED_FIELDS = ['remuneration', 'banking', 'tax', 'health', 'leave history', 'protected attributes', 'signatures']

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const documentId = getRouterParam(event, 'id')
  if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid contract document' })
  const parsed = hrContractRoleExtractSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid role extract', data: { issues: parsed.error.issues } })

  const document = await queryOne<{ id: string; team_member_id: string; status: string }>(
    `SELECT id, team_member_id, status FROM hr_contract_documents
     WHERE id = $1 AND status <> 'superseded'`,
    [documentId],
  )
  if (!document) throw createError({ statusCode: 404, statusMessage: 'Current contract document not found' })
  const input = parsed.data
  const extract = await transaction(async (db) => {
    const extractResult = await db.query(
      `INSERT INTO hr_contract_role_extracts
      (contract_document_id, role_title, department, employment_basis, ordinary_hours,
       reporting_to, role_purpose, responsibilities, expected_outcomes, decision_authority,
       role_exclusions, omitted_sensitive_fields, extraction_method, status, approved_by, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
             $11::jsonb, $12::jsonb, $13, $14,
             CASE WHEN $14 = 'approved' THEN $15::uuid ELSE NULL END,
             CASE WHEN $14 = 'approved' THEN NOW() ELSE NULL END)
     ON CONFLICT (contract_document_id)
     DO UPDATE SET role_title = EXCLUDED.role_title,
                   department = EXCLUDED.department,
                   employment_basis = EXCLUDED.employment_basis,
                   ordinary_hours = EXCLUDED.ordinary_hours,
                   reporting_to = EXCLUDED.reporting_to,
                   role_purpose = EXCLUDED.role_purpose,
                   responsibilities = EXCLUDED.responsibilities,
                   expected_outcomes = EXCLUDED.expected_outcomes,
                   decision_authority = EXCLUDED.decision_authority,
                   role_exclusions = EXCLUDED.role_exclusions,
                   omitted_sensitive_fields = EXCLUDED.omitted_sensitive_fields,
                   extraction_method = EXCLUDED.extraction_method,
                   status = EXCLUDED.status,
                   approved_by = EXCLUDED.approved_by,
                   approved_at = EXCLUDED.approved_at,
                   updated_at = NOW()
     RETURNING id, contract_document_id, role_title, status, approved_at, updated_at`,
      [
        documentId, input.roleTitle, input.department || null, input.employmentBasis || null,
        input.ordinaryHours || null, input.reportingTo || null, input.rolePurpose,
        JSON.stringify(input.responsibilities), JSON.stringify(input.expectedOutcomes),
        JSON.stringify(input.decisionAuthority), JSON.stringify(input.roleExclusions),
        JSON.stringify(OMITTED_FIELDS), input.extractionMethod, input.status, user.id,
      ],
    )
    const saved = extractResult.rows[0]
    if (input.status === 'approved') {
      await db.query(
        `UPDATE hr_contract_documents SET status = 'approved', approved_by = $2,
              approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [documentId, user.id],
      )
    }
    await recordHrAuditEvent({
      actorId: user.id,
      action: input.status === 'approved' ? 'contract_role_extract.approved' : 'contract_role_extract.saved',
      targetType: 'contract_role_extract',
      targetId: saved.id,
      metadata: { contractDocumentId: documentId, teamMemberId: document.team_member_id, omittedFieldCount: OMITTED_FIELDS.length },
    }, db)
    return saved
  })
  return { ok: true, extract }
})
