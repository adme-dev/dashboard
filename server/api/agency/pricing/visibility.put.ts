/**
 * Update Pricing Visibility Rules
 * PUT /api/agency/pricing/visibility
 *
 * Admin only - configure which roles can see pricing information
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateVisibilityBody {
  departmentId?: string
  viewRoles?: string[]
  editRoles?: string[]
  showEstimatedCost?: boolean
  showActualCost?: boolean
  showBillingRate?: boolean
  showCurrency?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Only admin/owner can modify pricing visibility rules
  if (!['admin', 'owner'].includes(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only administrators can modify pricing visibility rules'
    })
  }

  const body = await readBody<UpdateVisibilityBody>(event)
  const departmentId = body.departmentId || null

  // Check if rules exist for this department
  const existing = await queryOne(`
    SELECT id FROM pricing_visibility_rules
    WHERE department_id = $1 OR (department_id IS NULL AND $1 IS NULL)
  `, [departmentId])

  let rules
  if (existing) {
    // Update existing rules
    rules = await queryOne(`
      UPDATE pricing_visibility_rules
      SET
        view_roles = COALESCE($1, view_roles),
        edit_roles = COALESCE($2, edit_roles),
        show_estimated_cost = COALESCE($3, show_estimated_cost),
        show_actual_cost = COALESCE($4, show_actual_cost),
        show_billing_rate = COALESCE($5, show_billing_rate),
        show_currency = COALESCE($6, show_currency),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      body.viewRoles || null,
      body.editRoles || null,
      body.showEstimatedCost ?? null,
      body.showActualCost ?? null,
      body.showBillingRate ?? null,
      body.showCurrency ?? null,
      existing.id
    ])
  } else {
    // Create new rules
    rules = await queryOne(`
      INSERT INTO pricing_visibility_rules (
        department_id, view_roles, edit_roles,
        show_estimated_cost, show_actual_cost, show_billing_rate, show_currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      departmentId,
      body.viewRoles || ['admin', 'owner', 'lead'],
      body.editRoles || ['admin', 'owner'],
      body.showEstimatedCost ?? true,
      body.showActualCost ?? true,
      body.showBillingRate ?? true,
      body.showCurrency ?? true
    ])
  }

  return {
    id: rules.id,
    departmentId: rules.department_id,
    viewRoles: rules.view_roles,
    editRoles: rules.edit_roles,
    showEstimatedCost: rules.show_estimated_cost,
    showActualCost: rules.show_actual_cost,
    showBillingRate: rules.show_billing_rate,
    showCurrency: rules.show_currency
  }
})
