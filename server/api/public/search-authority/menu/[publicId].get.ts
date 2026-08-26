import { getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import type { MenuAgentPublicConfig } from '~~/server/utils/searchAuthority/menuAgent'

export default eventHandler(async (event): Promise<MenuAgentPublicConfig> => {
  const publicId = z.string().uuid().safeParse(getRouterParam(event, 'publicId'))
  if (!publicId.success) throw createError({ statusCode: 404, statusMessage: 'Menu configuration not found' })
  const row = await queryOne<{
    client_id: string
    site_id: string
    enabled: boolean
    label: string
    href: string
    desktop_selector: string
    mobile_selector: string
    insertion: 'append' | 'before-last'
    feature_enabled: boolean
    feature_selector: string
    feature_position: 'prepend' | 'append' | 'before' | 'after'
    feature_max_items: number
    feature_heading: string
    content_hostname: string | null
  }>(`SELECT config.client_id, config.site_id, config.enabled, config.label, config.href,
      config.desktop_selector, config.mobile_selector, config.insertion,
      config.feature_enabled, config.feature_selector, config.feature_position,
      config.feature_max_items, config.feature_heading, site.content_hostname
    FROM search_authority_menu_configs config
    JOIN search_authority_sites site ON site.client_id = config.client_id AND site.id = config.site_id
    WHERE config.public_id = $1`, [publicId.data])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Menu configuration not found' })

  // Only published guides are listed, newest activation first, bounded by the configured size.
  const items = row.feature_enabled && row.content_hostname
    ? await queryRows<{ slug: string, title: string, excerpt: string, published_at: string }>(`
      SELECT DISTINCT ON (asset.id) asset.slug, asset.title, version.excerpt, publication.published_at
      FROM search_authority_content_assets asset
      JOIN search_authority_publications publication
        ON publication.client_id = asset.client_id AND publication.asset_id = asset.id
       AND publication.status = 'published'
      JOIN search_authority_content_versions version
        ON version.client_id = asset.client_id AND version.id = publication.version_id
      WHERE asset.client_id = $1 AND asset.site_id = $2 AND asset.status = 'published'
      ORDER BY asset.id, publication.published_at DESC
    `, [row.client_id, row.site_id])
    : []
  const newest = items
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, row.feature_max_items)

  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=30, s-maxage=30')
  return {
    enabled: row.enabled,
    label: row.label,
    href: row.href,
    desktopSelector: row.desktop_selector,
    mobileSelector: row.mobile_selector,
    insertion: row.insertion,
    feature: {
      enabled: row.feature_enabled && Boolean(row.content_hostname),
      selector: row.feature_selector,
      position: row.feature_position,
      heading: row.feature_heading,
      items: newest.map(item => ({
        title: item.title,
        excerpt: item.excerpt.length > 160 ? `${item.excerpt.slice(0, 157).trimEnd()}…` : item.excerpt,
        href: `https://${row.content_hostname}/guides/${item.slug}`,
        publishedAt: new Date(item.published_at).toISOString()
      }))
    }
  }
})
