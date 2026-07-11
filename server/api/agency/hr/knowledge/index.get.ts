import { getQuery, setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' && ['draft', 'disputed', 'approved', 'superseded', 'archived'].includes(query.status) ? query.status : null
  const entryType = typeof query.entryType === 'string' ? query.entryType.slice(0, 80) : null
  const rows = await queryRows(
    `SELECT entry.id, entry.entry_key, entry.entry_type, entry.title, entry.status,
            owner.name AS owner_name, version.id AS version_id, version.version,
            version.content, version.source_refs, version.provenance_note,
            version.confidentiality, version.permitted_uses, version.limitations,
            version.effective_from, version.review_due_at, version.retention_review_at,
            version.dispute_note, version.general_ai_excluded, version.approved_at,
            version.created_at, creator.name AS created_by_name,
            established.id AS established_version_id,
            established.version AS established_version,
            established.content AS established_content,
            established.approved_at AS established_approved_at
       FROM hr_knowledge_entries entry
       JOIN LATERAL (
         SELECT * FROM hr_knowledge_entry_versions candidate
          WHERE candidate.entry_id = entry.id
          ORDER BY candidate.version DESC LIMIT 1
       ) version ON TRUE
       LEFT JOIN LATERAL (
         SELECT id, version, content, approved_at
           FROM hr_knowledge_entry_versions approved
          WHERE approved.entry_id = entry.id AND approved.status = 'approved'
          ORDER BY approved.version DESC LIMIT 1
       ) established ON TRUE
       LEFT JOIN team_members owner ON owner.id = entry.owner_id
       LEFT JOIN team_members creator ON creator.id = version.created_by
      WHERE ($1::text IS NULL OR entry.status = $1)
        AND ($2::text IS NULL OR entry.entry_type = $2)
      ORDER BY CASE entry.status WHEN 'disputed' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
               version.review_due_at, entry.title
      LIMIT 500`,
    [status, entryType],
  )
  await recordHrAuditEvent({ actorId: user.id, action: 'hr_knowledge.listed', targetType: 'hr_knowledge_base', metadata: { resultCount: rows.length } })
  return {
    entries: rows,
    policy: {
      access: 'hr_only',
      structuredSourceOfTruth: true,
      generalAiExcluded: true,
      vectorIndexing: 'disabled_by_default',
      prohibitedContent: ['original_contracts', 'questionnaire_answers', 'anonymous_raw_feedback', 'private_messages'],
    },
  }
})
