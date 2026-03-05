import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute, transaction } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Item ID is required' })

  const body = await readBody(event)
  const allowedFields = ['service_name', 'price', 'price_unit', 'setup_fee', 'setup_notes', 'notes', 'description', 'category_id', 'is_active']

  // Map camelCase body keys to snake_case DB columns
  const fieldMap: Record<string, string> = {
    serviceName: 'service_name',
    priceUnit: 'price_unit',
    setupFee: 'setup_fee',
    setupNotes: 'setup_notes',
    categoryId: 'category_id',
    isActive: 'is_active',
    description: 'description',
  }

  // Fetch current values for audit comparison
  const current = await queryOne<any>(`
    SELECT service_name, price, price_unit, setup_fee, setup_notes, notes, description, category_id, is_active
    FROM rate_card_items WHERE id = $1
  `, [id])

  if (!current) throw createError({ statusCode: 404, statusMessage: 'Rate card item not found' })

  // Build updates and audit entries
  const updates: string[] = []
  const auditEntries: { field: string; oldVal: string; newVal: string }[] = []
  const params: any[] = [id]
  let paramIdx = 2

  for (const [bodyKey, value] of Object.entries(body)) {
    const dbCol = fieldMap[bodyKey] || bodyKey
    if (!allowedFields.includes(dbCol)) continue
    if (value === undefined) continue

    const oldVal = String(current[dbCol] ?? '')
    const newVal = String(value ?? '')
    if (oldVal === newVal) continue

    params.push(value)
    updates.push(`${dbCol} = $${paramIdx}`)
    paramIdx++

    auditEntries.push({ field: dbCol, oldVal, newVal })
  }

  if (updates.length === 0) {
    return { message: 'No changes detected' }
  }

  // Add updated_by and updated_at
  params.push(user.id)
  updates.push(`updated_by = $${paramIdx}`)
  paramIdx++
  updates.push(`updated_at = NOW()`)

  await transaction(async (client) => {
    // Update item
    await client.query(
      `UPDATE rate_card_items SET ${updates.join(', ')} WHERE id = $1`,
      params
    )

    // Log each field change as separate audit entry
    for (const entry of auditEntries) {
      await client.query(`
        INSERT INTO rate_card_audit_log (item_id, action, field_name, old_value, new_value, changed_by)
        VALUES ($1, 'update', $2, $3, $4, $5)
      `, [id, entry.field, entry.oldVal, entry.newVal, user.id])
    }
  })

  const updated = await queryOne<any>(`
    SELECT i.*, c.name AS category_name
    FROM rate_card_items i
    JOIN rate_card_categories c ON c.id = i.category_id
    WHERE i.id = $1
  `, [id])

  return updated
})
