import { transaction } from '~~/server/utils/db'

export interface ClaimedSiteIntelligenceDomain {
  domainId: string
  clientId: string
  nextRunAt: string
}

interface ClaimedDomainRow {
  domain_id: string
  client_id: string
  next_run_at: string | Date
}

export async function claimDueSiteIntelligenceDomains(
  requestedLimit = 20,
  now = new Date()
): Promise<ClaimedSiteIntelligenceDomain[]> {
  const limit = Math.max(1, Math.min(20, Math.trunc(requestedLimit)))
  const rows = await transaction(async (db) => {
    const result = await db.query<ClaimedDomainRow>(`
      WITH due AS (
        SELECT d.id
        FROM site_intelligence_domains d
        WHERE d.status = 'active'
          AND d.frequency IN ('daily', 'weekly')
          AND (d.next_run_at IS NULL OR d.next_run_at <= $2::timestamptz)
          AND NOT EXISTS (
            SELECT 1
            FROM site_intelligence_crawl_runs r
            WHERE r.domain_id = d.id
              AND r.status IN ('queued', 'running')
          )
        ORDER BY d.next_run_at ASC NULLS FIRST, d.id ASC
        FOR UPDATE OF d SKIP LOCKED
        LIMIT $1
      )
      UPDATE site_intelligence_domains d
      SET next_run_at = CASE d.frequency
        WHEN 'daily' THEN $2::timestamptz + INTERVAL '1 day'
        WHEN 'weekly' THEN $2::timestamptz + INTERVAL '7 days'
        ELSE NULL
      END
      FROM due
      WHERE d.id = due.id
      RETURNING d.id AS domain_id, d.client_id, d.next_run_at
    `, [limit, now.toISOString()])
    return result.rows
  })

  return rows.map(row => ({
    domainId: row.domain_id,
    clientId: row.client_id,
    nextRunAt: row.next_run_at instanceof Date ? row.next_run_at.toISOString() : row.next_run_at
  }))
}
