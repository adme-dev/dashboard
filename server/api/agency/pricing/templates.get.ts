/**
 * Get price templates for quick quote creation
 * Requires quote view permission
 */

import { queryRows } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'view')

  const query = getQuery(event)

  try {
    // Build dynamic query with filters
    const conditions: string[] = ['is_active = true']
    const params: any[] = []
    let idx = 1

    if (query.category) {
      conditions.push(`category = $${idx}`)
      params.push(query.category)
      idx++
    }

    if (query.itemType) {
      conditions.push(`item_type = $${idx}`)
      params.push(query.itemType)
      idx++
    }

    if (query.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`)
      params.push(`%${query.search}%`)
      idx++
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const templates = await queryRows(`
      SELECT *
      FROM price_templates
      ${whereClause}
      ORDER BY category, name
    `, params)

    // Group by category
    const grouped: Record<string, any[]> = {}
    for (const template of templates) {
      const category = template.category || 'Other'
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push({
        id: template.id,
        name: template.name,
        description: template.description,
        itemType: template.item_type,
        category: template.category,
        defaultUnit: template.default_unit,
        defaultUnitPrice: template.default_unit_price ? Number(template.default_unit_price) : null,
        defaultHourlyRate: template.default_hourly_rate ? Number(template.default_hourly_rate) : null,
        defaultAgencyFeePercent: template.default_agency_fee_percent ? Number(template.default_agency_fee_percent) : null,
      })
    }

    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        itemType: t.item_type,
        category: t.category,
        defaultUnit: t.default_unit,
        defaultUnitPrice: t.default_unit_price ? Number(t.default_unit_price) : null,
        defaultHourlyRate: t.default_hourly_rate ? Number(t.default_hourly_rate) : null,
        defaultAgencyFeePercent: t.default_agency_fee_percent ? Number(t.default_agency_fee_percent) : null,
      })),
      groupedByCategory: grouped,
      categories: Object.keys(grouped).sort(),
    }
  } catch (error) {
    console.error('Failed to fetch price templates:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch price templates'
    })
  }
})
