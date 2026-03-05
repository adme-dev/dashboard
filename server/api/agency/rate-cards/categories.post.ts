import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { id, name, sortOrder } = body

  if (!name || !name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Category name is required' })
  }

  if (id) {
    // Update existing category
    const updated = await queryOne<any>(`
      UPDATE rate_card_categories
      SET name = $2, sort_order = COALESCE($3, sort_order), updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, sort_order, is_active
    `, [id, name.trim(), sortOrder ?? null])

    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Category not found' })
    return updated
  }

  // Create new category
  const category = await queryOne<any>(`
    INSERT INTO rate_card_categories (name, sort_order)
    VALUES ($1, COALESCE($2, 0))
    ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = NOW()
    RETURNING id, name, sort_order, is_active
  `, [name.trim(), sortOrder ?? 0])

  return category
})
