import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const { search, active } = getQuery(event)

  let whereClause = ''
  const params: any[] = []

  if (active !== undefined) {
    params.push(active === 'true' || active === '1')
    whereClause += ` AND i.is_active = $${params.length}`
  }

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = String(search).replace(/%/g, '\\%').replace(/_/g, '\\_')
    params.push(`%${escaped}%`)
    whereClause += ` AND i.service_name ILIKE $${params.length}`
  }

  const rows = await queryRows(`
    SELECT i.id, i.service_name, i.price, i.price_unit, i.setup_fee, i.setup_notes,
           i.notes, i.description, i.is_active, i.created_at, i.updated_at,
           c.id AS category_id, c.name AS category_name, c.sort_order
    FROM rate_card_items i
    JOIN rate_card_categories c ON c.id = i.category_id
    WHERE c.is_active = true ${whereClause}
    ORDER BY c.sort_order ASC, c.name ASC, i.service_name ASC
  `, params)

  // Group by category
  const grouped: Record<string, { id: string; name: string; sortOrder: number; items: any[] }> = {}
  for (const row of rows) {
    if (!grouped[row.category_id]) {
      grouped[row.category_id] = {
        id: row.category_id,
        name: row.category_name,
        sortOrder: row.sort_order,
        items: [],
      }
    }
    grouped[row.category_id].items.push({
      id: row.id,
      categoryId: row.category_id,
      serviceName: row.service_name,
      price: Number(row.price),
      priceUnit: row.price_unit,
      setupFee: Number(row.setup_fee || 0),
      setupNotes: row.setup_notes,
      notes: row.notes,
      description: row.description || '',
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  return {
    categories: Object.values(grouped).sort((a, b) => a.sortOrder - b.sortOrder),
    totalItems: rows.length,
  }
})
