/** Render the install snippet for a site. GET /api/agency/tracking/:id/snippet */
import { queryOne } from '~~/server/utils/db'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'

function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  await requireSiteTrackingAccess(event, id) // role + per-client access for this site
  const site = await queryOne(
    `SELECT name, write_key, spa, vehicle_page_patterns FROM tracking_sites WHERE id = $1`,
    [id]
  ) as { name: string | null, write_key: string, spa: boolean, vehicle_page_patterns: string[] | null } | null
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const origin = getRequestProtocol(event) + '://' + getRequestHost(event)
  const spaAttr = site.spa ? ' data-spa="true"' : ''
  const patterns = site.vehicle_page_patterns ?? []
  const vehiclePatternsAttr = patterns.length
    ? ` data-vehicle-patterns="${escapeHtmlAttr(JSON.stringify(patterns))}"`
    : ''
  const raw = `<script src="${origin}/track.js" data-key="${site.write_key}"${spaAttr}${vehiclePatternsAttr} async></script>`
  return {
    name: site.name,
    spa: !!site.spa,
    writeKey: site.write_key,
    vehiclePagePatterns: patterns,
    raw,
    gtm: `In GTM → Tags → New → Custom HTML, paste:\n${raw}\nTrigger: All Pages (Window Loaded).`
  }
})
