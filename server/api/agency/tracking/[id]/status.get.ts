/** Install status for a tracking site — has the tag started sending events yet?
 *  GET /api/agency/tracking/:id/status
 *  Powers the "Awaiting first event / Receiving events" indicator so marketing
 *  can confirm an install (or a third-party install) actually took. */
import { queryOne } from '~~/server/utils/db'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  await requireSiteTrackingAccess(event, id) // role + per-client access for this site

  const row = await queryOne(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '24 hours')::int AS last24h,
            MAX(received_at) AS "lastEventAt"
     FROM tracking_events WHERE site_id = $1`,
    [id]
  ) as { total: number, last24h: number, lastEventAt: string | null } | null

  return {
    installed: (row?.total ?? 0) > 0,
    total: row?.total ?? 0,
    last24h: row?.last24h ?? 0,
    lastEventAt: row?.lastEventAt ?? null
  }
})
