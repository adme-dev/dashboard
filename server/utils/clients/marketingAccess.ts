// Browser client-directory boundary for the explicit MARKETING_MANAGEMENT department role.
// The department sees every active client and marketing reporting, but never agency accounting:
// rates, labour, expenses, invoices, profitability, commission or private notes. Holding FINANCE,
// ADMIN or MANAGEMENT (by fresh group or legacy role name) restores the legacy financial view.
//
// Reads the database directly on every call: the session's permission groups come from the
// five-minute KV role cache, which could keep a newly restricted user on the financial view.
import { createError } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { roleHasPermission, SYSTEM_ROLE_PERMISSIONS } from '~~/server/utils/permissions'

export const CLIENT_FINANCIAL_ACCESS_HEADER = 'x-client-financial-access'
export const MARKETING_CLIENT_ACCESS = { financial: false, scope: 'marketing_management' } as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FINANCIAL_GROUPS = ['FINANCE', 'ADMIN', 'MANAGEMENT'] as const

/** Client fields the department may edit; everything else on the client PUT is financial/admin. */
export const MARKETING_EDITABLE_CLIENT_FIELDS = new Set(['name', 'contactEmail', 'contactPhone', 'reportingTimezone'])

interface AccessRow {
  role: string | null
  has_custom_role: boolean
  has_policy: boolean
  marketing: boolean | null
  financial: boolean | null
}

function isClientUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** True when fresh role policy grants MARKETING_MANAGEMENT without FINANCE, ADMIN or MANAGEMENT. */
export async function isMarketingClientViewer(userId: string): Promise<boolean> {
  if (!isClientUuid(userId)) throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })
  let row: AccessRow | null
  try {
    row = await queryOneFresh<AccessRow>(`
      SELECT tm.user_role::text AS role,
             tm.custom_role_id IS NOT NULL AS has_custom_role,
             bool_or(cr.id IS NOT NULL) AS has_policy,
             COALESCE(bool_or(rpg.permission_group::text = 'MARKETING_MANAGEMENT'), FALSE) AS marketing,
             COALESCE(bool_or(rpg.permission_group::text IN ('FINANCE', 'ADMIN', 'MANAGEMENT')), FALSE) AS financial
        FROM team_members tm
        LEFT JOIN custom_roles cr ON cr.id = tm.custom_role_id
          OR (tm.custom_role_id IS NULL AND cr.is_system = TRUE AND cr.slug = tm.user_role::text)
        LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id
       WHERE tm.id = $1 AND tm.is_active = TRUE
       GROUP BY tm.id`, [userId])
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Client access policy unavailable' })
  }
  if (!row) throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })
  const role = row.role ?? ''
  // Legacy role names still pass FINANCE/ADMIN/MANAGEMENT gates elsewhere, so they keep finance too.
  const legacyFinancial = FINANCIAL_GROUPS.some(group => roleHasPermission(role, group))
  if (row.has_policy !== true) {
    // A dangling custom role grants nothing anywhere else; never let it fall through to finance.
    if (row.has_custom_role) throw createError({ statusCode: 403, statusMessage: 'Role policy unavailable' })
    // Unseeded system role: the static defaults apply, and they never grant MARKETING_MANAGEMENT.
    return (SYSTEM_ROLE_PERMISSIONS[role] ?? []).includes('MARKETING_MANAGEMENT') && !legacyFinancial
  }
  if (row.marketing !== true) return false
  return row.financial !== true && !legacyFinancial
}

/** Native financial routes deny the department outright rather than reporting zero values. */
export async function denyMarketingClientViewer(userId: string): Promise<void> {
  if (await isMarketingClientViewer(userId)) {
    throw createError({ statusCode: 403, statusMessage: 'Agency financials require finance or management access' })
  }
}

/** Fresh active-client lookup; inactive, missing and malformed IDs are indistinguishable. */
export async function requireActiveMarketingClient(clientId: string | undefined): Promise<void> {
  const row = isClientUuid(clientId)
    ? await queryOneFresh('SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE', [clientId])
    : null
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
}
