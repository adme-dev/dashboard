/** Create a tracking site. POST /api/agency/tracking */
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { executeGodModeTrackingSiteCreate } from '~~/server/utils/tracking/godModeMutations'
import { generateWriteKey } from '~~/server/utils/tracking/write-key'
import {
  DEFAULT_PROVIDER_TRACKING_SETTINGS,
  ProviderTrackingSettingsSchema
} from '~~/server/utils/tracking/provider-settings'

interface Body {
  clientId: string
  name: string
  allowedOrigins?: string[]
  spa?: boolean
  consentMode?: string
  leadSelectors?: string[]
  retentionDays?: number
  enforceOrigin?: boolean
  providerTracking?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  // Gate on the target client: role + (for scoped roles) assignment to this client.
  await requireClientTrackingAccess(event, body?.clientId)
  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }
  const providerTracking = ProviderTrackingSettingsSchema.safeParse(
    body.providerTracking ?? DEFAULT_PROVIDER_TRACKING_SETTINGS
  )
  if (!providerTracking.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid provider tracking settings' })
  }
  const row = await executeGodModeTrackingSiteCreate(event, async (db) => {
    const inserted = await db.query(
      `INSERT INTO tracking_sites (client_id, name, write_key, allowed_origins, spa, consent_mode, lead_selectors, retention_days, enforce_origin, provider_tracking)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb
        WHERE COALESCE(($10::jsonb->'podium'->>'confirmedLeads')::boolean, FALSE) = FALSE
           OR EXISTS (
             SELECT 1 FROM lead_webhook_endpoints endpoint
              WHERE endpoint.client_id = $1
                AND endpoint.source = 'podium'
           )
       RETURNING *`,
      [
        body.clientId, body.name.trim(), generateWriteKey(),
        body.allowedOrigins ?? [], body.spa ?? false, body.consentMode ?? 'off',
        body.leadSelectors ?? [], body.retentionDays ?? 395, body.enforceOrigin ?? false,
        JSON.stringify(providerTracking.data)
      ]
    )
    const site = inserted.rows[0]
    if (!site) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Connect the Podium webhook before enabling confirmed leads'
      })
    }
    return site
  }, async (db, resultReference) => {
    const replayed = await db.query(`SELECT * FROM tracking_sites WHERE id = $1`, [resultReference])
    const site = replayed.rows[0]
    if (!site) throw new Error('Replayed tracking site no longer exists')
    return site
  })
  return { site: row }
})
