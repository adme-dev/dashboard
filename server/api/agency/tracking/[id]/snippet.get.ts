/** Render the install snippet for a site. GET /api/agency/tracking/:id/snippet */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const id = getRouterParam(event, 'id')
  const site = await queryOne(`SELECT write_key, spa FROM tracking_sites WHERE id = $1`, [id]) as any
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const origin = getRequestProtocol(event) + '://' + getRequestHost(event)
  const spaAttr = site.spa ? ' data-spa="true"' : ''
  const raw = `<script src="${origin}/track.js" data-key="${site.write_key}"${spaAttr} async></script>`
  return {
    writeKey: site.write_key,
    raw,
    gtm: `In GTM → Tags → New → Custom HTML, paste:\n${raw}\nTrigger: All Pages (Window Loaded).`
  }
})
