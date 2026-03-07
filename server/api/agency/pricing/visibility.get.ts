/**
 * Get Pricing Visibility Rules
 * GET /api/agency/pricing/visibility
 *
 * Returns pricing visibility for the current user based on their role.
 * Table schema: row-per-role with resource_type, role_required, can_view/can_edit columns.
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const userRole = user.role || 'member'

  // Admin and owner always have full access
  if (userRole === 'admin' || userRole === 'owner') {
    return { canViewPricing: true, canEditPricing: true }
  }

  // Check if this role has a job_pricing visibility rule
  try {
    const rule = await queryOne(`
      SELECT can_view, can_edit FROM pricing_visibility_rules
      WHERE resource_type = 'job_pricing' AND role_required = $1
    `, [userRole])

    return {
      canViewPricing: rule?.can_view ?? false,
      canEditPricing: rule?.can_edit ?? false,
    }
  } catch {
    // Table may not exist or query may fail — default to no access for non-admin
    return { canViewPricing: false, canEditPricing: false }
  }
})
