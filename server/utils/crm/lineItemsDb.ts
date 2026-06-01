// server/utils/crm/lineItemsDb.ts
// F14 — opportunity line-item persistence + value roll-up. Every mutation
// recomputes the opportunity's amount (sum of line_total) per the deriveOppValue
// rule. All operations are client-scoped.
import { queryRows, queryOne, execute } from '~~/server/utils/db'

export interface LineItemRow {
  id: string
  client_id: string
  opportunity_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  position: number
}

async function assertOppInClient(clientId: string, oppId: string): Promise<void> {
  const opp = await queryOne(
    `SELECT id FROM crm_opportunities WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [oppId, clientId])
  if (!opp) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
}

/** Re-derive the opportunity's amount from its line-items (keeps manual amount when none). */
export async function recomputeOppValue(clientId: string, oppId: string): Promise<void> {
  await execute(
    `UPDATE crm_opportunities o
        SET amount = COALESCE((SELECT SUM(line_total) FROM crm_opportunity_line_items WHERE opportunity_id = o.id), o.amount),
            updated_at = now()
      WHERE o.id = $1 AND o.client_id = $2`,
    [oppId, clientId],
  )
}

export async function listLineItems(clientId: string, oppId: string): Promise<LineItemRow[]> {
  return await queryRows<LineItemRow>(
    `SELECT * FROM crm_opportunity_line_items WHERE client_id = $1 AND opportunity_id = $2 ORDER BY position ASC, created_at ASC`,
    [clientId, oppId],
  )
}

export async function createLineItem(clientId: string, oppId: string, input: {
  description: string, quantity?: number, unit_price?: number, position?: number,
}): Promise<LineItemRow> {
  await assertOppInClient(clientId, oppId)
  const row = await queryOne<LineItemRow>(
    `INSERT INTO crm_opportunity_line_items (client_id, opportunity_id, description, quantity, unit_price, position)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [clientId, oppId, input.description, input.quantity ?? 1, input.unit_price ?? 0, input.position ?? 0],
  )
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Failed to add line item' })
  await recomputeOppValue(clientId, oppId)
  return row
}

export async function updateLineItem(clientId: string, itemId: string, patch: {
  description?: string, quantity?: number, unit_price?: number, position?: number,
}): Promise<LineItemRow> {
  const sets: string[] = []
  const params: unknown[] = []
  const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`) }
  if (patch.description !== undefined) add('description', patch.description)
  if (patch.quantity !== undefined) add('quantity', patch.quantity)
  if (patch.unit_price !== undefined) add('unit_price', patch.unit_price)
  if (patch.position !== undefined) add('position', patch.position)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  sets.push('updated_at = now()')
  params.push(itemId, clientId)
  const row = await queryOne<LineItemRow>(
    `UPDATE crm_opportunity_line_items SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND client_id = $${params.length} RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Line item not found' })
  await recomputeOppValue(clientId, row.opportunity_id)
  return row
}

export async function deleteLineItem(clientId: string, itemId: string): Promise<void> {
  const row = await queryOne<{ opportunity_id: string }>(
    `DELETE FROM crm_opportunity_line_items WHERE id = $1 AND client_id = $2 RETURNING opportunity_id`,
    [itemId, clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Line item not found' })
  await recomputeOppValue(clientId, row.opportunity_id)
}
