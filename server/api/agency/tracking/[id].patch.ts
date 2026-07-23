/** Update tracking site config. PATCH /api/agency/tracking/:id */
import { queryOne } from '~~/server/utils/db'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { invalidateSiteCache } from '~~/server/utils/tracking/site-config'
import { ProviderTrackingSettingsSchema } from '~~/server/utils/tracking/provider-settings'

interface UpdatedTrackingSite {
  write_key?: string
  [key: string]: unknown
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  await requireSiteTrackingAccess(event, id) // role + per-client access for this site
  const body = await readBody<Record<string, unknown>>(event)
  const allowed = ['name', 'allowed_origins', 'enforce_origin', 'spa', 'consent_mode', 'lead_selectors', 'retention_days', 'is_active', 'provider_tracking']
  const sets: string[] = []
  const params: unknown[] = []
  let podiumConfirmedLeads = false
  for (const [k, v] of Object.entries(body || {})) {
    const col = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (allowed.includes(col)) {
      let value = v
      if (col === 'provider_tracking') {
        const parsed = ProviderTrackingSettingsSchema.safeParse(v)
        if (!parsed.success) {
          throw createError({ statusCode: 400, statusMessage: 'Invalid provider tracking settings' })
        }
        value = JSON.stringify(parsed.data)
        podiumConfirmedLeads = parsed.data.podium.confirmedLeads
      }
      params.push(value)
      sets.push(`${col} = $${params.length}${col === 'provider_tracking' ? '::jsonb' : ''}`)
    }
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No updatable fields' })
  params.push(id)
  const podiumActivationGuard = podiumConfirmedLeads
    ? ` AND EXISTS (
          SELECT 1
          FROM lead_webhook_endpoints endpoint
          WHERE endpoint.client_id = tracking_sites.client_id
            AND endpoint.source = 'podium'
        )`
    : ''
  const row = await queryOne<UpdatedTrackingSite>(
    `UPDATE tracking_sites
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}${podiumActivationGuard}
      RETURNING *`,
    params
  )
  if (!row && podiumActivationGuard) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Connect the Podium webhook before enabling confirmed leads'
    })
  }
  if (row?.write_key) invalidateSiteCache(row.write_key)
  return { site: row }
})
