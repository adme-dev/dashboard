import { setHeader } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { normalizeMondayEvidenceListQuery } from '~~/server/utils/socialNewsMondayEvidence'

interface ClientEvidenceRow {
  id: string
  evidenceType: string
  sourceSystem: string
  sourceId: string | null
  sourceUrl: string | null
  title: string
  content: string
  summary: string | null
  occurredAt: string | null
  reviewStatus: string
  projectId: string | null
  projectName: string | null
  totalCount: number
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const input = normalizeMondayEvidenceListQuery(getQuery(event) as Record<string, unknown>)
  const offset = (input.page - 1) * input.pageSize

  const rows = await queryRows<ClientEvidenceRow>(
    `SELECT evidence.id, evidence.evidence_type AS "evidenceType",
            evidence.source_system AS "sourceSystem", evidence.source_id AS "sourceId",
            evidence.source_url AS "sourceUrl", evidence.title, evidence.content,
            evidence.summary, evidence.occurred_at AS "occurredAt",
            evidence.review_status AS "reviewStatus", evidence.project_id AS "projectId",
            project.name AS "projectName", COUNT(*) OVER()::int AS "totalCount"
       FROM client_operational_evidence evidence
       LEFT JOIN projects project
         ON project.id = evidence.project_id AND project.client_id = evidence.client_id
      WHERE evidence.client_id = $1 AND evidence.review_status = $2
      ORDER BY evidence.occurred_at DESC NULLS LAST, evidence.created_at DESC
      LIMIT $3 OFFSET $4`,
    [clientId, input.reviewStatus, input.pageSize, offset],
  )
  const totalItems = Number(rows[0]?.totalCount || 0)
  return {
    data: rows,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  }
})
