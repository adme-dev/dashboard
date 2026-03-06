/**
 * Get all brief categories with counts
 */

import { queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'
import { setCacheHeaders } from '~~/server/utils/cacheHeaders'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event, 300, 600)

  try {
    return await cachedFetch(event, 'brief:categories', 300, async () => {
    const categories = await queryRows(`
      SELECT
        bc.id,
        bc.name,
        bc.slug,
        bc.description,
        bc.icon,
        bc.color,
        bc.sort_order,
        bc.is_active,
        bc.created_at,
        bc.updated_at,
        COUNT(DISTINCT bt.id) AS template_count,
        COUNT(DISTINCT b.id) AS brief_count
      FROM brief_categories bc
      LEFT JOIN brief_templates bt ON bc.id = bt.category_id AND bt.is_active = true
      LEFT JOIN briefs b ON bt.id = b.template_id
      WHERE bc.is_active = true
      GROUP BY bc.id
      ORDER BY bc.sort_order ASC, bc.name ASC
    `)

    return categories.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sort_order,
      isActive: c.is_active,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      templateCount: Number(c.template_count) || 0,
      briefCount: Number(c.brief_count) || 0
    }))
    }) // end cachedFetch
  } catch (error: any) {
    console.error('Failed to fetch brief categories:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch brief categories'
    })
  }
})
