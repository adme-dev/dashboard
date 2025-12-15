/**
 * Get Pricing Visibility Rules
 * GET /api/agency/pricing/visibility
 *
 * Returns pricing visibility rules for the current user's role
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined

  // Get the visibility rules
  let rules
  if (departmentId) {
    // Try department-specific rules first, then global
    rules = await queryOne(`
      SELECT * FROM pricing_visibility_rules
      WHERE department_id = $1
    `, [departmentId])

    if (!rules) {
      rules = await queryOne(`
        SELECT * FROM pricing_visibility_rules
        WHERE department_id IS NULL
      `)
    }
  } else {
    rules = await queryOne(`
      SELECT * FROM pricing_visibility_rules
      WHERE department_id IS NULL
    `)
  }

  // Default rules if none exist
  const defaultRules = {
    viewRoles: ['admin', 'owner', 'lead'],
    editRoles: ['admin', 'owner'],
    showEstimatedCost: true,
    showActualCost: true,
    showBillingRate: true,
    showCurrency: true
  }

  const currentRules = rules || defaultRules

  // Check if user can view/edit pricing based on their role
  const userRole = user.role || 'member'
  const canView = currentRules.view_roles?.includes(userRole) ||
    userRole === 'admin' ||
    userRole === 'owner'
  const canEdit = currentRules.edit_roles?.includes(userRole) ||
    userRole === 'admin' ||
    userRole === 'owner'

  return {
    canViewPricing: canView,
    canEditPricing: canEdit,
    rules: {
      id: rules?.id || null,
      departmentId: rules?.department_id || null,
      viewRoles: currentRules.view_roles || defaultRules.viewRoles,
      editRoles: currentRules.edit_roles || defaultRules.editRoles,
      showEstimatedCost: currentRules.show_estimated_cost ?? defaultRules.showEstimatedCost,
      showActualCost: currentRules.show_actual_cost ?? defaultRules.showActualCost,
      showBillingRate: currentRules.show_billing_rate ?? defaultRules.showBillingRate,
      showCurrency: currentRules.show_currency ?? defaultRules.showCurrency
    }
  }
})
