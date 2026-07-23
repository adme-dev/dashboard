import { randomBytes } from 'node:crypto'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'

interface RotatedEndpointRow {
  id: string
  url_token: string
}

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const actor = await requireWriteAccess(event)
  const webhookSecret = randomBytes(32).toString('hex')

  const row = await queryOne<RotatedEndpointRow>(
    `UPDATE lead_webhook_endpoints
        SET secret_key_previous = secret_key,
            secret_key = $2,
            secret_key_grace_until = NOW() + INTERVAL '30 minutes',
            rotated_at = NOW()
      WHERE client_id = $1
        AND source = 'podium'
      RETURNING id, url_token`,
    [clientId, webhookSecret]
  )
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Podium endpoint not found' })
  }

  console.info({
    event: 'podium_lead_endpoint_rotated',
    clientId,
    endpointId: row.id,
    actorId: actor.id
  })
  return {
    ok: true,
    endpoint: {
      id: row.id,
      path: `/api/leads/webhook/podium/${row.url_token}`
    },
    webhookSecret,
    graceMinutes: 30
  }
})
