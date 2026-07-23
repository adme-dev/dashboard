import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'

interface PodiumEndpointRow {
  id: string
  url_token: string
  rotated_at: string | null
  secret_key_grace_until: string | null
}

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)

  const row = await queryOne<PodiumEndpointRow>(
    `SELECT id, url_token, rotated_at, secret_key_grace_until
       FROM lead_webhook_endpoints
      WHERE client_id = $1
        AND source = 'podium'
      LIMIT 1`,
    [clientId]
  )
  if (!row) return { configured: false, endpoint: null }

  return {
    configured: true,
    endpoint: {
      id: row.id,
      urlToken: row.url_token,
      path: `/api/leads/webhook/podium/${row.url_token}`,
      rotatedAt: row.rotated_at,
      secretGraceUntil: row.secret_key_grace_until
    }
  }
})
