import type { DomainDatabase } from './domainAttachment'

export async function listAgencyPageStudioReviews(tenantId: string, db: DomainDatabase) {
  return (await db.query(`
    SELECT version.id AS "versionId", site.id AS "siteId",
           client.name AS "clientName", site.name AS "siteName",
           version.summary, version.status,
           version.submitted_at AS "submittedAt",
           review.decision, review.comment,
           reviewer.name AS "reviewerName",
           review.decided_at AS "decidedAt"
    FROM page_studio_versions version
    JOIN page_studio_sites site
      ON site.tenant_id = version.tenant_id
     AND site.client_id = version.client_id
     AND site.id = version.site_id
    JOIN agency_clients client ON client.id = version.client_id
    LEFT JOIN LATERAL (
      SELECT candidate.decision, candidate.comment, candidate.reviewer_id, candidate.decided_at
      FROM page_studio_reviews candidate
      WHERE candidate.tenant_id = version.tenant_id
        AND candidate.client_id = version.client_id
        AND candidate.site_id = version.site_id
        AND candidate.version_id = version.id
      ORDER BY candidate.decided_at DESC
      LIMIT 1
    ) review ON TRUE
    LEFT JOIN team_members reviewer ON reviewer.id = review.reviewer_id
    WHERE version.tenant_id = $1
      AND (version.status = 'in_review' OR review.decision IS NOT NULL)
    ORDER BY COALESCE(review.decided_at, version.submitted_at, version.updated_at) DESC
    LIMIT $2
  `, [tenantId, 200])).rows
}
