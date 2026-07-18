import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

const Body = z.strictObject({
  client_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000)
})

interface EndpointRow {
  id: string
  url_token: string
  secret_key?: string
}

function response(row: EndpointRow, created: boolean) {
  return {
    created,
    endpoint: {
      id: row.id,
      urlToken: row.url_token,
      path: `/api/leads/webhook/generic/${row.url_token}`
    },
    secretKey: created ? row.secret_key ?? null : null
  }
}

export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }

  const urlToken = randomBytes(18).toString('hex')
  const secretKey = randomBytes(24).toString('hex')
  const inserted = await queryOne<EndpointRow>(
    `INSERT INTO lead_webhook_endpoints (
       client_id, source, url_token, secret_key, provisioned_by, provision_reason
     ) VALUES ($1, 'webhook', $2, $3, $4, $5)
     ON CONFLICT (client_id, source) WHERE source = 'webhook'
     DO NOTHING
     RETURNING id, url_token, secret_key`,
    [parsed.data.client_id, urlToken, secretKey, actor.id, parsed.data.reason]
  )
  if (inserted) {
    console.info({
      event: 'first_party_lead_endpoint_provisioned',
      clientId: parsed.data.client_id,
      endpointId: inserted.id,
      actorId: actor.id
    })
    return response(inserted, true)
  }

  const existing = await queryOne<EndpointRow>(
    `SELECT id, url_token
       FROM lead_webhook_endpoints
      WHERE client_id = $1
        AND source = 'webhook'
      LIMIT 1`,
    [parsed.data.client_id]
  )
  if (!existing) {
    throw createError({ statusCode: 409, statusMessage: 'Website endpoint could not be resolved' })
  }
  return response(existing, false)
})
