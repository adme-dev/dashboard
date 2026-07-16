import { setHeader } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import {
  MONDAY_EVIDENCE_CANDIDATES_CTE,
  normalizeMondayEvidencePreviewQuery,
} from '~~/server/utils/socialNewsMondayEvidence'

interface MondayEvidencePreviewRow {
  sourceId: string
  evidenceType: 'plan' | 'discussion'
  title: string
  content: string
  author: string | null
  sourceUrl: string | null
  occurredAt: string | null
  projectId: string
  projectName: string
  importedStatus: 'pending' | 'approved' | 'rejected' | 'superseded' | null
  totalCount: number
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const input = normalizeMondayEvidencePreviewQuery(getQuery(event) as Record<string, unknown>)
  if (!input.includePlans && !input.includeDiscussions) {
    return { data: [], totalItems: 0, limit: input.limit }
  }

  const rows = await queryRows<MondayEvidencePreviewRow>(
    `${MONDAY_EVIDENCE_CANDIDATES_CTE}
     SELECT candidate.source_id AS "sourceId", candidate.evidence_type AS "evidenceType",
            candidate.title, candidate.content, candidate.author,
            candidate.source_url AS "sourceUrl", candidate.occurred_at AS "occurredAt",
            candidate.project_id AS "projectId", project.name AS "projectName",
            existing.review_status AS "importedStatus",
            COUNT(*) OVER()::int AS "totalCount"
       FROM deduped_candidates candidate
       JOIN projects project ON project.id = candidate.project_id
       LEFT JOIN client_operational_evidence existing
         ON existing.client_id = $1
        AND existing.source_system = 'monday'
        AND existing.source_id = candidate.source_id
      WHERE ($2::boolean OR candidate.evidence_type <> 'plan')
        AND ($3::boolean OR candidate.evidence_type <> 'discussion')
      ORDER BY candidate.occurred_at DESC NULLS LAST, candidate.source_id
      LIMIT $4`,
    [clientId, input.includePlans, input.includeDiscussions, input.limit],
  )

  return {
    data: rows,
    totalItems: Number(rows[0]?.totalCount || 0),
    limit: input.limit,
  }
})
