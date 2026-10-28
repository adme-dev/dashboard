import { createError, type H3Event } from 'h3'
import { queryRows, queryOneFresh } from './db'
import { kvGet, kvPut, kvDelete } from './kv'
import { roleHasPermission } from './permissions'
import type { User } from './auth'

const CACHE_TTL = 300 // 5 minutes

/**
 * Get the list of client IDs assigned to a team member.
 * Uses KV cache with 5-minute TTL to avoid repeated DB lookups.
 */
export async function getAssignedClientIds(event: H3Event, userId: string): Promise<string[]> {
  const cacheKey = `client-assignments:${userId}`
  const cached = await kvGet<string[]>(event, cacheKey)
  if (cached) return cached

  const rows = await queryRows<{ client_id: string }>(
    'SELECT client_id FROM client_team_assignments WHERE team_member_id = $1',
    [userId]
  )
  const ids = rows.map(r => r.client_id)
  kvPut(event, cacheKey, ids, CACHE_TTL)
  return ids
}

/**
 * Resolve invoice access level for a user:
 * - Finance roles (owner, admin, lead, PM, finance, accounts) → 'all'
 * - Users with FINANCE permission group → 'all'
 * - Account managers (INVOICE_OWN_CLIENTS) → scoped client ID array
 * - Everyone else → 403
 */
export async function resolveInvoiceAccess(event: H3Event, user: User): Promise<'all' | string[]> {
  const isFinance = roleHasPermission(user.role, 'FINANCE')
    || user.permissionGroups?.includes('FINANCE')
  if (isFinance) return 'all'

  const hasInvoiceAccess = roleHasPermission(user.role, 'INVOICE_OWN_CLIENTS')
    || user.permissionGroups?.includes('INVOICE_OWN_CLIENTS')
  if (!hasInvoiceAccess) {
    throw createError({ statusCode: 403, statusMessage: 'No invoice access' })
  }

  return getAssignedClientIds(event, user.id)
}

/**
 * Convenience wrapper: authenticate + resolve invoice access in one call.
 * Returns the user and their client scope ('all' or specific IDs).
 */
export async function requireInvoiceAccess(event: H3Event): Promise<{ user: User; clientIds: 'all' | string[] }> {
  const { requireAuth } = await import('./auth')
  const user = await requireAuth(event)
  const clientIds = await resolveInvoiceAccess(event, user)
  return { user, clientIds }
}

/**
 * Invalidate a user's assignment cache after team changes.
 */
export function invalidateAssignmentCache(event: H3Event, userId: string) {
  kvDelete(event, `client-assignments:${userId}`)
}

/** Fresh explicit browser grant; never infer marketing management from a legacy role or KV cache. */
export async function hasFreshMarketingManagementPermission(userId: string): Promise<boolean> {
  const row = await queryOneFresh<{ allowed: boolean }>(`
    SELECT TRUE AS allowed
      FROM team_members tm
      JOIN custom_roles cr ON cr.id = tm.custom_role_id
        OR (tm.custom_role_id IS NULL AND cr.is_system = TRUE AND cr.slug = tm.user_role::text)
      JOIN role_permission_groups rpg ON rpg.role_id = cr.id
     WHERE tm.id = $1 AND tm.is_active = TRUE
       AND rpg.permission_group = 'MARKETING_MANAGEMENT'
     LIMIT 1`, [userId])
  return row?.allowed === true
}
