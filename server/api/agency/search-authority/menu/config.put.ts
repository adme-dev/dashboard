import { readBody } from 'h3'
import { z } from 'zod'
import { queryOne, transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { menuAgentConfigInput, normalizeMenuAgentConfig } from '~~/server/utils/searchAuthority/menuAgent'

const Body = menuAgentConfigInput.extend({
  clientId: z.string().uuid(),
  siteId: z.string().uuid()
})

export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid menu configuration' })
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const site = await queryOne<{ content_hostname: string | null }>(`
    SELECT content_hostname FROM search_authority_sites
    WHERE client_id = $1 AND id = $2
  `, [parsed.data.clientId, parsed.data.siteId])
  if (!site?.content_hostname) {
    throw createError({ statusCode: 409, statusMessage: 'Configure the content hostname before the menu link' })
  }
  const config = normalizeMenuAgentConfig(parsed.data, site.content_hostname)
  const row = await transaction(async (db) => {
    const result = await db.query<{ public_id: string, last_observed_at: string | null, updated_at: string }>(`
      INSERT INTO search_authority_menu_configs (
        client_id, site_id, enabled, label, href, desktop_selector,
        mobile_selector, insertion, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (client_id, site_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        label = EXCLUDED.label,
        href = EXCLUDED.href,
        desktop_selector = EXCLUDED.desktop_selector,
        mobile_selector = EXCLUDED.mobile_selector,
        insertion = EXCLUDED.insertion,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING public_id, last_observed_at, updated_at
    `, [parsed.data.clientId, parsed.data.siteId, config.enabled, config.label,
      config.href, config.desktopSelector, config.mobileSelector, config.insertion, user.id])
    await db.query(`INSERT INTO search_authority_site_audit_events (
      client_id, site_id, actor_id, event_type, details
    ) VALUES ($1, $2, $3, 'menu.configured', $4::jsonb)`, [
      parsed.data.clientId, parsed.data.siteId, user.id,
      JSON.stringify({ enabled: config.enabled, href: config.href, insertion: config.insertion })
    ])
    const saved = result.rows[0]
    if (!saved) throw new Error('Menu configuration could not be stored')
    return saved
  })
  return {
    config: {
      ...config,
      publicId: row.public_id,
      lastObservedAt: row.last_observed_at,
      updatedAt: row.updated_at
    }
  }
})
