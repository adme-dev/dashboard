import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Item ID is required' })

  const item = await queryOne<any>(`
    SELECT id, service_name, is_active FROM rate_card_items WHERE id = $1
  `, [id])

  if (!item) throw createError({ statusCode: 404, statusMessage: 'Rate card item not found' })

  // Soft-delete: set is_active = false
  await execute(`
    UPDATE rate_card_items SET is_active = false, updated_by = $2, updated_at = NOW() WHERE id = $1
  `, [id, user.id])

  // Log audit entry
  await execute(`
    INSERT INTO rate_card_audit_log (item_id, action, field_name, old_value, new_value, changed_by)
    VALUES ($1, 'delete', 'is_active', 'true', 'false', $2)
  `, [id, user.id])

  return { success: true, message: `"${item.service_name}" archived` }
})
