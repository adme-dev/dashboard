import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { parseRateCardCsv } from '~~/server/utils/rateCardCsvParser'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { csvText, dryRun } = body

  if (!csvText || typeof csvText !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'csvText is required' })
  }

  const parsed = parseRateCardCsv(csvText)

  if (dryRun) {
    return {
      preview: true,
      categories: parsed.categories,
      itemCount: parsed.items.length,
      items: parsed.items.slice(0, 50), // Preview first 50
      errors: parsed.errors,
    }
  }

  // Import into database
  const result = await transaction(async (client) => {
    let categoriesCreated = 0
    let itemsCreated = 0
    let itemsUpdated = 0

    // Upsert categories
    const categoryMap = new Map<string, string>()
    for (let i = 0; i < parsed.categories.length; i++) {
      const catName = parsed.categories[i]
      const res = await client.query(`
        INSERT INTO rate_card_categories (name, sort_order)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = NOW()
        RETURNING id
      `, [catName, i])
      categoryMap.set(catName, res.rows[0].id)
      categoriesCreated++
    }

    // Insert items
    for (const item of parsed.items) {
      const categoryId = categoryMap.get(item.category)
      if (!categoryId) continue

      // Check for existing item with same name in same category
      const existing = await client.query(`
        SELECT id FROM rate_card_items
        WHERE category_id = $1 AND service_name = $2
      `, [categoryId, item.serviceName])

      if (existing.rows.length > 0) {
        // Update existing — $1=id, $2=price, $3=priceUnit, $4=setupFee, $5=setupNotes, $6=notes, $7=updatedBy
        const itemId = existing.rows[0].id
        await client.query(`
          UPDATE rate_card_items
          SET price = COALESCE($2, price),
              price_unit = $3,
              setup_fee = $4,
              setup_notes = COALESCE(NULLIF($5, ''), setup_notes),
              notes = COALESCE(NULLIF($6, ''), notes),
              is_active = true,
              updated_by = $7,
              updated_at = NOW()
          WHERE id = $1
        `, [itemId, item.price, item.priceUnit, item.setupFee, item.setupNotes, item.notes, user.id])

        // Audit log
        await client.query(`
          INSERT INTO rate_card_audit_log (item_id, action, changed_by)
          VALUES ($1, 'import', $2)
        `, [itemId, user.id])

        itemsUpdated++
      } else {
        // Insert new
        const res = await client.query(`
          INSERT INTO rate_card_items (category_id, service_name, price, price_unit, setup_fee, setup_notes, notes, created_by, updated_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          RETURNING id
        `, [categoryId, item.serviceName, item.price ?? 0, item.priceUnit, item.setupFee, item.setupNotes || null, item.notes || null, user.id])

        // Audit log
        await client.query(`
          INSERT INTO rate_card_audit_log (item_id, action, changed_by)
          VALUES ($1, 'import', $2)
        `, [res.rows[0].id, user.id])

        itemsCreated++
      }
    }

    return { categoriesCreated, itemsCreated, itemsUpdated }
  })

  return {
    success: true,
    ...result,
    errors: parsed.errors,
  }
})
