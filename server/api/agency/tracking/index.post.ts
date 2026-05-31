/** Create a tracking site. POST /api/agency/tracking */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { generateWriteKey } from '~~/server/utils/tracking/write-key'

interface Body {
  clientId: string
  name: string
  allowedOrigins?: string[]
  spa?: boolean
  consentMode?: string
  leadSelectors?: string[]
  retentionDays?: number
  enforceOrigin?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  // Gate on the target client: role + (for scoped roles) assignment to this client.
  await requireClientTrackingAccess(event, body?.clientId)
  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }
  const row = await queryOne(
    `INSERT INTO tracking_sites (client_id, name, write_key, allowed_origins, spa, consent_mode, lead_selectors, retention_days, enforce_origin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      body.clientId, body.name.trim(), generateWriteKey(),
      body.allowedOrigins ?? [], body.spa ?? false, body.consentMode ?? 'off',
      body.leadSelectors ?? [], body.retentionDays ?? 395, body.enforceOrigin ?? false
    ]
  )
  return { site: row }
})
