import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)

  const [assignment, evidenceCounts, evidence] = await Promise.all([
    queryOne(
      `SELECT a.id AS assignment_id, a.starts_on, a.ends_on, a.project_id, a.rate_card_item_id,
              a.budget_allocation_id, a.commercial_scope_snapshot, p.name AS package_name,
              v.id AS package_version_id, v.version, ba.state AS budget_state,
              COUNT(sp.id)::int AS used_posts,
              COUNT(sp.id) FILTER (WHERE sp.status IN ('published','partially_published'))::int AS published_posts
         FROM social_content_package_assignments a
         JOIN social_content_package_versions v ON v.id = a.package_version_id
         JOIN social_content_packages p ON p.id = v.package_id
         LEFT JOIN job_budget_allocations ba ON ba.id = a.budget_allocation_id
         LEFT JOIN social_posts sp ON sp.metadata->>'socialPackageAssignmentId' = a.id::text
        WHERE a.client_id = $1 AND a.status = 'active'
        GROUP BY a.id, p.name, v.id, v.version, ba.state
        ORDER BY a.starts_on DESC LIMIT 1`,
      [clientId],
    ),
    queryOne<{ pending: number; approved: number }>(
      `SELECT COUNT(*) FILTER (WHERE review_status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE review_status = 'approved')::int AS approved
         FROM client_operational_evidence WHERE client_id = $1`,
      [clientId],
    ),
    queryRows(
      `SELECT id, evidence_type, source_system, title,
              COALESCE(NULLIF(summary, ''), LEFT(content, 2000)) AS summary,
              occurred_at, review_status
         FROM client_operational_evidence
        WHERE client_id = $1 AND review_status = 'approved'
        ORDER BY occurred_at DESC NULLS LAST, created_at DESC LIMIT 8`,
      [clientId],
    ),
  ])

  return {
    activePackage: assignment ? {
      assignmentId: assignment.assignment_id,
      packageName: assignment.package_name,
      packageVersionId: assignment.package_version_id,
      version: Number(assignment.version),
      startsOn: assignment.starts_on,
      endsOn: assignment.ends_on,
      projectId: assignment.project_id,
      rateCardItemId: assignment.rate_card_item_id,
      commercialScope: assignment.commercial_scope_snapshot || {},
      usage: { usedPosts: Number(assignment.used_posts || 0), publishedPosts: Number(assignment.published_posts || 0) },
      budget: assignment.budget_allocation_id ? {
        allocationId: assignment.budget_allocation_id,
        state: assignment.budget_state,
      } : null,
    } : null,
    evidence: {
      pendingCount: Number(evidenceCounts?.pending || 0),
      approvedCount: Number(evidenceCounts?.approved || 0),
      approved: evidence,
    },
  }
})
