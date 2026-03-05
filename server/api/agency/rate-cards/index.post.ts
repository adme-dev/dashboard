import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { categoryId, serviceName, price, priceUnit, setupFee, setupNotes, notes } = body

  if (!categoryId || !serviceName || price == null) {
    throw createError({ statusCode: 400, statusMessage: 'categoryId, serviceName, and price are required' })
  }

  const item = await queryOne<any>(`
    INSERT INTO rate_card_items (category_id, service_name, price, price_unit, setup_fee, setup_notes, notes, created_by, updated_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    RETURNING id, service_name, price, price_unit, setup_fee, setup_notes, notes, is_active, created_at
  `, [categoryId, serviceName, price, priceUnit || 'once-off', setupFee || 0, setupNotes || null, notes || null, user.id])

  // Log audit entry
  await execute(`
    INSERT INTO rate_card_audit_log (item_id, action, changed_by)
    VALUES ($1, 'create', $2)
  `, [item.id, user.id])

  return item
})
