/**
 * GET /api/office/:officeId/lobbies/analytics
 * Admin-only public lobby performance summary.
 */
import { queryRows } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { ensureOfficeLobbyRequestsTable } from '~~/server/utils/officeLobbyRequests'
import { ensureOfficeGuestBadgesTable } from '~~/server/utils/officeGuestBadges'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'

type LobbyAnalyticsRow = {
  lobby_id: string
  handle: string
  name: string
  total_requests: number
  pending_requests: number
  accepted_requests: number
  declined_requests: number
  expired_requests: number
  scheduled_requests: number
  guest_badges: number
  requests_today: number
  daily_cap: number | null
  acceptance_rate: number
  last_request_at: string | null
}

const CSV_HEADERS = [
  'Handle',
  'Name',
  'Total requests',
  'Pending',
  'Accepted',
  'Declined',
  'Expired',
  'Scheduled',
  'Guest badges',
  'Requests today',
  'Daily cap',
  'Acceptance rate',
  'Last request'
]

function csvCell(value: string | number | null) {
  const raw = value === null ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

function analyticsCsv(rows: LobbyAnalyticsRow[]) {
  const lines = [
    CSV_HEADERS.map(csvCell).join(','),
    ...rows.map(row => [
      row.handle,
      row.name,
      row.total_requests,
      row.pending_requests,
      row.accepted_requests,
      row.declined_requests,
      row.expired_requests,
      row.scheduled_requests,
      row.guest_badges,
      row.requests_today,
      row.daily_cap,
      `${row.acceptance_rate}%`,
      row.last_request_at
    ].map(csvCell).join(','))
  ]
  return `${lines.join('\n')}\n`
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  await ensureOfficeLobbiesTable()
  await ensureOfficeLobbyRequestsTable()
  await ensureOfficeGuestBadgesTable()

  const analytics = await queryRows<LobbyAnalyticsRow>(
    `SELECT ol.id AS lobby_id,
            ol.handle,
            ol.name,
            COUNT(olr.id)::int AS total_requests,
            COUNT(*) FILTER (WHERE olr.status = 'pending')::int AS pending_requests,
            COUNT(*) FILTER (WHERE olr.status = 'accepted')::int AS accepted_requests,
            COUNT(*) FILTER (WHERE olr.status = 'declined')::int AS declined_requests,
            COUNT(*) FILTER (WHERE olr.status = 'expired')::int AS expired_requests,
            COUNT(*) FILTER (WHERE olr.scheduled_start_at IS NOT NULL)::int AS scheduled_requests,
            COUNT(ogb.id)::int AS guest_badges,
            COUNT(*) FILTER (
              WHERE olr.created_at >= date_trunc('day', now())
                AND olr.created_at < date_trunc('day', now()) + interval '1 day'
            )::int AS requests_today,
            CASE
              WHEN ol.config->>'daily_cap' ~ '^[0-9]+$'
              THEN (ol.config->>'daily_cap')::int
              ELSE NULL
            END AS daily_cap,
            CASE
              WHEN COUNT(olr.id) = 0 THEN 0
              ELSE ROUND(
                COUNT(*) FILTER (WHERE olr.status = 'accepted')::numeric
                / COUNT(olr.id)::numeric
                * 100
              )::int
            END AS acceptance_rate,
            MAX(olr.created_at) AS last_request_at
     FROM office_lobbies ol
     LEFT JOIN office_lobby_requests olr ON olr.lobby_id = ol.id
     LEFT JOIN office_guest_badges ogb ON ogb.lobby_request_id = olr.id
     WHERE ol.office_id = $1
     GROUP BY ol.id, ol.handle, ol.name
     ORDER BY total_requests DESC, ol.created_at DESC`,
    [officeId]
  )

  const query = getQuery(event)
  if (query.format === 'csv') {
    await logOfficeAuditEvent({
      officeId,
      actorId: user.id,
      action: 'lobby.analytics_exported',
      targetType: 'office_lobby',
      targetId: null,
      metadata: {
        format: 'csv',
        rows: analytics.length
      }
    })
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', 'attachment; filename="office-lobby-analytics.csv"')
    return analyticsCsv(analytics)
  }

  return { analytics }
})
