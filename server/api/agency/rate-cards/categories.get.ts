import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const rows = await queryRows(`
    SELECT c.id, c.name, c.sort_order, c.is_active,
           COUNT(i.id) FILTER (WHERE i.is_active = true) AS item_count,
           COUNT(i.id) AS total_count
    FROM rate_card_categories c
    LEFT JOIN rate_card_items i ON i.category_id = c.id
    WHERE c.is_active = true
    GROUP BY c.id, c.name, c.sort_order, c.is_active
    ORDER BY c.sort_order ASC, c.name ASC
  `)

  return {
    categories: rows.map(r => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      itemCount: Number(r.item_count),
      totalCount: Number(r.total_count),
    }))
  }
})
