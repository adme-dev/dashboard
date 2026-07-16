import { readBody, setHeader } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import {
  MONDAY_EVIDENCE_CANDIDATES_CTE,
  normalizeMondayEvidenceImportInput,
} from '~~/server/utils/socialNewsMondayEvidence'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const input = normalizeMondayEvidenceImportInput(await readBody<Record<string, unknown>>(event))
  if (!input.sourceIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Choose at least one mapped Monday item to import' })
  }

  const imported = await queryRows<{ id: string; sourceId: string; reviewStatus: 'pending' }>(
    `${MONDAY_EVIDENCE_CANDIDATES_CTE}
     INSERT INTO client_operational_evidence AS existing
       (client_id, project_id, evidence_type, source_system, source_id, source_url,
        title, content, occurred_at, imported_at, review_status, created_by)
     SELECT $1, candidate.project_id, candidate.evidence_type, 'monday', candidate.source_id,
            candidate.source_url, candidate.title, candidate.content, candidate.occurred_at,
            NOW(), 'pending', $3
       FROM deduped_candidates candidate
      WHERE candidate.source_id = ANY($2::text[])
     ON CONFLICT (client_id, source_system, source_id) WHERE source_id IS NOT NULL
     DO UPDATE SET project_id = EXCLUDED.project_id, source_url = EXCLUDED.source_url,
                   title = EXCLUDED.title, content = EXCLUDED.content,
                   occurred_at = EXCLUDED.occurred_at, imported_at = NOW(),
                   review_status = 'pending', reviewed_by = NULL, reviewed_at = NULL,
                   updated_at = NOW()
       WHERE existing.review_status <> 'approved'
     RETURNING id, source_id AS "sourceId", review_status AS "reviewStatus"`,
    [clientId, input.sourceIds, user.id],
  )

  return {
    requested: input.sourceIds.length,
    imported: imported.length,
    skipped: input.sourceIds.length - imported.length,
    evidence: imported,
  }
})
