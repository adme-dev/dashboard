/** Create a tracking site. POST /api/agency/tracking */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { generateWriteKey } from '~~/server/utils/tracking/write-key'

interface Body {
  clientId: string
  name: string
  allowedOrigins?: string[]
  spa?: boolean
  consentMode?: string
  leadSelectors?: string[]
  retentionDays?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const body = await readBody<Body>(event)
  if (!body?.clientId || !body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'clientId and name are required' })
  }
  const row = await queryOne(
    `INSERT INTO tracking_sites (client_id, name, write_key, allowed_origins, spa, consent_mode, lead_selectors, retention_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      body.clientId, body.name.trim(), generateWriteKey(),
      body.allowedOrigins ?? [], body.spa ?? false, body.consentMode ?? 'off',
      body.leadSelectors ?? [], body.retentionDays ?? 395
    ]
  )
  return { site: row }
})
