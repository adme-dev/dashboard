/**
 * Brief → Quote Generator
 *
 * When a brief requiring a quote is approved, auto-generates an internal quote
 * with line items priced via the rate card system.
 */

import { queryOne, queryRows, execute, transaction } from '~~/server/utils/db'
import { findBestMatch } from '~~/server/utils/rateCardMatcher'

interface GenerateQuoteResult {
  quoteId: string
  quoteNumber: string
  total: number
  lineItemCount: number
  tasksLinked: number
}

interface BriefFieldRow {
  field_key: string
  field_label: string
  field_type: string
  value: any
}

interface RateCardItem {
  id: string
  serviceName: string
  price: number
  priceUnit: string
  categoryName: string
}

// Field keys that indicate deliverable/scope fields
const DELIVERABLE_KEYS = ['deliverables', 'services', 'scope', 'requirements', 'items', 'tasks']

/**
 * Extract deliverable names from brief field values.
 * Looks for checkboxgroup/multiselect fields whose keys match deliverable patterns.
 * Falls back to brief title as a single line item.
 */
function extractDeliverables(fields: BriefFieldRow[], briefTitle: string): string[] {
  const deliverables: string[] = []

  for (const field of fields) {
    const keyLower = field.field_key.toLowerCase()
    const isDeliverableField = DELIVERABLE_KEYS.some(dk => keyLower.includes(dk))

    if (!isDeliverableField) continue
    if (!['checkboxgroup', 'multiselect', 'select'].includes(field.field_type)) continue

    let values: string[] = []
    if (Array.isArray(field.value)) {
      values = field.value.filter((v: any) => typeof v === 'string' && v.trim())
    } else if (typeof field.value === 'string' && field.value.trim()) {
      values = [field.value.trim()]
    }

    deliverables.push(...values)
  }

  // Fallback: use brief title if no deliverables extracted
  if (deliverables.length === 0) {
    deliverables.push(briefTitle || 'Project Work')
  }

  return deliverables
}

/**
 * Generate an internal quote from an approved brief using rate card pricing.
 *
 * Steps:
 * 1. Validate brief (status=approved, no existing quote)
 * 2. Extract deliverables from field values
 * 3. Match deliverables to rate card items
 * 4. Create quote + line items in a transaction
 */
export async function generateQuoteFromBrief(
  briefId: string,
  userId: string
): Promise<GenerateQuoteResult> {
  // 1. Fetch brief + template
  const brief = await queryOne(`
    SELECT
      b.id, b.title, b.client_id, b.status, b.quote_id,
      bt.id AS template_id, bt.requires_quote
    FROM briefs b
    JOIN brief_templates bt ON b.template_id = bt.id
    WHERE b.id = $1
  `, [briefId])

  if (!brief) {
    throw createError({ statusCode: 404, statusMessage: 'Brief not found' })
  }

  if (brief.status !== 'approved') {
    throw createError({ statusCode: 400, statusMessage: 'Brief must be approved to generate a quote' })
  }

  if (brief.quote_id) {
    throw createError({ statusCode: 400, statusMessage: 'Brief already has a linked quote' })
  }

  // 2. Fetch field values
  const fields = await queryRows<BriefFieldRow>(`
    SELECT btf.field_key, btf.field_label, btf.field_type, bfv.value
    FROM brief_field_values bfv
    JOIN brief_template_fields btf ON bfv.field_id = btf.id
    WHERE bfv.brief_id = $1
  `, [briefId])

  // 3. Extract deliverables
  const deliverables = extractDeliverables(fields, brief.title)

  // 4. Fetch active rate card items
  const rateCardItems = await queryRows<RateCardItem>(`
    SELECT
      rci.id,
      rci.service_name AS "serviceName",
      rci.price,
      rci.price_unit AS "priceUnit",
      COALESCE(rcc.name, 'General') AS "categoryName"
    FROM rate_card_items rci
    LEFT JOIN rate_card_categories rcc ON rci.category_id = rcc.id
    WHERE rci.is_active = true
  `, [])

  // 5. Match deliverables to rate card
  const lineItems: Array<{
    name: string
    description: string
    itemType: string
    quantity: number
    unit: string
    unitPrice: number
    category: string
  }> = []

  for (const deliverable of deliverables) {
    const match = findBestMatch(deliverable, rateCardItems, 0.4)

    if (match) {
      lineItems.push({
        name: match.serviceName,
        description: deliverable,
        itemType: 'service',
        quantity: 1,
        unit: match.priceUnit === 'hourly' ? 'hr' : 'ea',
        unitPrice: match.price,
        category: match.categoryName,
      })
    } else {
      // Unmatched — placeholder for manual pricing
      lineItems.push({
        name: deliverable,
        description: `From brief: ${brief.title}`,
        itemType: 'service',
        quantity: 1,
        unit: 'ea',
        unitPrice: 0,
        category: 'General',
      })
    }
  }

  // 6. Create quote + line items in a transaction
  const result = await transaction(async (client) => {
    // Generate valid_from and valid_until (+30 days)
    const now = new Date()
    const validUntil = new Date(now)
    validUntil.setDate(validUntil.getDate() + 30)

    // Insert quote
    const quoteRes = await client.query(`
      INSERT INTO quotes (
        brief_id, client_id, title, description,
        valid_from, valid_until,
        tax_percent, currency, status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, quote_number
    `, [
      briefId,
      brief.client_id,
      brief.title,
      `Auto-generated from brief: ${brief.title}`,
      now.toISOString(),
      validUntil.toISOString(),
      10, // 10% GST
      'AUD',
      'draft',
      userId,
    ])

    const quoteId = quoteRes.rows[0].id
    const quoteNumber = quoteRes.rows[0].quote_number

    // Insert line items
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i]
      await client.query(`
        INSERT INTO quote_line_items (
          quote_id, name, description, item_type,
          quantity, unit, unit_price, category, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        quoteId,
        li.name,
        li.description,
        li.itemType,
        li.quantity,
        li.unit,
        li.unitPrice,
        li.category,
        i + 1,
      ])
    }

    // Link quote to brief
    await client.query(
      `UPDATE briefs SET quote_id = $2, updated_at = NOW() WHERE id = $1`,
      [briefId, quoteId]
    )

    // Log activity
    await client.query(`
      INSERT INTO brief_activities (brief_id, user_id, activity_type, content)
      VALUES ($1, $2, $3, $4)
    `, [
      briefId,
      userId,
      'quote_generated',
      `Quote ${quoteNumber} auto-generated with ${lineItems.length} line items`,
    ])

    // Fetch the calculated total (DB triggers compute it)
    const totalRes = await client.query(
      `SELECT total FROM quotes WHERE id = $1`,
      [quoteId]
    )

    return {
      quoteId,
      quoteNumber,
      total: Number(totalRes.rows[0]?.total || 0),
      lineItemCount: lineItems.length,
    }
  })

  // Backfill existing brief tasks with quote line item budget data
  let tasksLinked = 0
  try {
    tasksLinked = await backfillBriefTaskBudgets(briefId, result.quoteId)
  } catch (err) {
    console.error('[Brief] Task budget backfill failed:', err)
  }

  return { ...result, tasksLinked }
}

/**
 * Retroactively link tasks (already attached to a brief) to matching quote line items.
 * Uses fuzzy matching between task titles and line item names.
 * Non-critical: returns 0 on any failure.
 */
async function backfillBriefTaskBudgets(briefId: string, quoteId: string): Promise<number> {
  try {
    // 1. Fetch tasks attached to this brief that don't yet have a quote line item link
    const tasks = await queryRows<{ id: string; title: string }>(`
      SELECT id, title FROM tasks
      WHERE brief_id = $1 AND quote_line_item_id IS NULL
    `, [briefId])

    if (tasks.length === 0) return 0

    // 2. Fetch line items for this quote
    const lineItems = await queryRows<{
      id: string
      name: string
      unitPrice: number
      estimatedHours: number | null
    }>(`
      SELECT id, name, unit_price AS "unitPrice", estimated_hours AS "estimatedHours"
      FROM quote_line_items
      WHERE quote_id = $1
    `, [quoteId])

    if (lineItems.length === 0) return 0

    // 3. Shape line items as RateCardEntry[] for findBestMatch
    const shapedItems = lineItems.map(li => ({
      id: li.id,
      serviceName: li.name,
      price: Number(li.unitPrice) || 0,
      priceUnit: 'fixed' as const,
      categoryName: '',
    }))

    // 4. Match each task to a line item (lower threshold — task titles are often loose)
    const matchMap = new Map<string, string[]>() // lineItemId → taskId[]
    const taskMatchMap = new Map<string, { lineItemId: string; unitPrice: number; estimatedHours: number | null }>()

    for (const task of tasks) {
      const match = findBestMatch(task.title, shapedItems, 0.3)
      if (!match) continue

      const lineItem = lineItems.find(li => li.id === match.itemId)
      if (!lineItem) continue

      // Track which tasks matched to which line item (for shared count)
      if (!matchMap.has(lineItem.id)) matchMap.set(lineItem.id, [])
      matchMap.get(lineItem.id)!.push(task.id)

      taskMatchMap.set(task.id, {
        lineItemId: lineItem.id,
        unitPrice: Number(lineItem.unitPrice) || 0,
        estimatedHours: lineItem.estimatedHours ? Number(lineItem.estimatedHours) : null,
      })
    }

    // 5. Update each matched task with budget data
    let linked = 0
    for (const [taskId, matchData] of taskMatchMap) {
      const sharedCount = matchMap.get(matchData.lineItemId)?.length || 1
      const estimatedCost = matchData.unitPrice / sharedCount
      const estimatedHours = matchData.estimatedHours ? matchData.estimatedHours / sharedCount : null

      await execute(`
        UPDATE tasks SET
          quote_line_item_id = $2,
          budget_source = 'quote',
          estimated_cost = $3,
          billing_rate = $4
          ${estimatedHours !== null ? ', estimated_hours = $5' : ''}
        WHERE id = $1
      `, estimatedHours !== null
        ? [taskId, matchData.lineItemId, estimatedCost, matchData.unitPrice, estimatedHours]
        : [taskId, matchData.lineItemId, estimatedCost, matchData.unitPrice]
      )

      linked++
    }

    return linked
  } catch (err) {
    console.error('[Brief] backfillBriefTaskBudgets error:', err)
    return 0
  }
}
