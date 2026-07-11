import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const documents = await queryRows(
    `SELECT document.id, document.team_member_id, member.name AS member_name,
            member.email AS member_email, document.version, document.file_name,
            document.content_type, document.size_bytes, document.checksum_sha256,
            document.status, document.effective_from, document.retention_review_at,
            document.approved_at, document.created_at,
            extract.id AS extract_id, extract.role_title, extract.department,
            extract.employment_basis, extract.ordinary_hours, extract.reporting_to,
            extract.role_purpose, extract.responsibilities, extract.expected_outcomes,
            extract.decision_authority, extract.role_exclusions,
            extract.omitted_sensitive_fields, extract.extraction_method,
            extract.status AS extract_status, extract.approved_at AS extract_approved_at
     FROM hr_contract_documents document
     JOIN team_members member ON member.id = document.team_member_id
     LEFT JOIN hr_contract_role_extracts extract ON extract.contract_document_id = document.id
     ORDER BY member.name, document.version DESC`,
  )

  const roster = await queryRows(
    `SELECT member.id, member.name, member.email,
            COALESCE(member.role, member.user_role::text) AS current_role,
            department.name AS department,
            latest.id AS latest_contract_id,
            latest.status AS contract_status,
            latest.version AS contract_version,
            latest.extract_status
     FROM team_members member
     LEFT JOIN departments department ON department.id = member.department_id
     LEFT JOIN LATERAL (
       SELECT document.id, document.status, document.version, extract.status AS extract_status
       FROM hr_contract_documents document
       LEFT JOIN hr_contract_role_extracts extract ON extract.contract_document_id = document.id
       WHERE document.team_member_id = member.id
       ORDER BY document.version DESC LIMIT 1
     ) latest ON true
     WHERE member.is_active = true
     ORDER BY member.name`,
  )

  return {
    roster,
    documents,
    privacy: {
      generalKnowledgeBase: false,
      originalVisibility: 'business_owner_only',
      roleExtractRequiresApproval: true,
      excludedFields: ['remuneration', 'banking', 'tax', 'health', 'leave history', 'protected attributes', 'signatures'],
    },
  }
})
