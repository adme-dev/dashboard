import { getQuery } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Query = z.object({ clientId: z.string().uuid(), siteId: z.string().uuid() })

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid menu configuration request' })
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const row = await queryOne<{
    public_id: string
    enabled: boolean
    label: string
    href: string
    desktop_selector: string
    mobile_selector: string
    insertion: 'append' | 'before-last'
    last_observed_at: string | null
    updated_at: string
  }>(`SELECT config.public_id, config.enabled, config.label, config.href,
      config.desktop_selector, config.mobile_selector, config.insertion,
      config.last_observed_at, config.updated_at
    FROM search_authority_menu_configs config
    WHERE config.client_id = $1 AND config.site_id = $2`, [parsed.data.clientId, parsed.data.siteId])

  return { config: row ? mapRow(row) : null }
})

function mapRow(row: {
  public_id: string
  enabled: boolean
  label: string
  href: string
  desktop_selector: string
  mobile_selector: string
  insertion: 'append' | 'before-last'
  last_observed_at: string | null
  updated_at: string
}) {
  return {
    publicId: row.public_id,
    enabled: row.enabled,
    label: row.label,
    href: row.href,
    desktopSelector: row.desktop_selector,
    mobileSelector: row.mobile_selector,
    insertion: row.insertion,
    lastObservedAt: row.last_observed_at,
    updatedAt: row.updated_at
  }
}
