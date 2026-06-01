/** Render the install snippet for a site. GET /api/agency/tracking/:id/snippet */
import { queryOne } from '~~/server/utils/db'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  await requireSiteTrackingAccess(event, id) // role + per-client access for this site
  const site = await queryOne(
    `SELECT name, write_key, spa FROM tracking_sites WHERE id = $1`,
    [id]
  ) as { name: string | null, write_key: string, spa: boolean } | null
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const origin = getRequestProtocol(event) + '://' + getRequestHost(event)
  const spaAttr = site.spa ? ' data-spa="true"' : ''
  const raw = `<script src="${origin}/track.js" data-key="${site.write_key}"${spaAttr} async></script>`
  return {
    name: site.name,
    spa: !!site.spa,
    writeKey: site.write_key,
    raw,
    gtm: `In GTM → Tags → New → Custom HTML, paste:\n${raw}\nTrigger: All Pages (Window Loaded).`
  }
})
