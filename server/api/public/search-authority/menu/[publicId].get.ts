import { getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const publicId = z.string().uuid().safeParse(getRouterParam(event, 'publicId'))
  if (!publicId.success) throw createError({ statusCode: 404, statusMessage: 'Menu configuration not found' })
  const row = await queryOne<{
    enabled: boolean
    label: string
    href: string
    desktop_selector: string
    mobile_selector: string
    insertion: 'append' | 'before-last'
  }>(`SELECT enabled, label, href, desktop_selector, mobile_selector, insertion
    FROM search_authority_menu_configs WHERE public_id = $1`, [publicId.data])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Menu configuration not found' })
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=30, s-maxage=30')
  return {
    enabled: row.enabled,
    label: row.label,
    href: row.href,
    desktopSelector: row.desktop_selector,
    mobileSelector: row.mobile_selector,
    insertion: row.insertion
  }
})
