// server/utils/crm/queryScope.ts
// Builds a parameterized WHERE that always enforces client scoping + soft-delete.
import { queryOne } from '~~/server/utils/db'
import { hasRole, type User } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

// A condition fragment with one `?` placeholder per supplied value.
// `params` length MUST equal the number of `?` in `sql` (supports multi-placeholder
// clauses like `(a ILIKE ? OR b ILIKE ?)`); mismatches throw to prevent silent
// param-index shifting.
export interface Cond { sql: string, params: unknown[] }

export function buildWhere(clientId: string, extra: Cond[]): { where: string, params: unknown[] } {
  const conds: string[] = ['deleted_at IS NULL', 'client_id = ?']
  const params: unknown[] = [clientId]
  for (const c of extra) {
    const placeholders = (c.sql.match(/\?/g) || []).length
    if (placeholders !== c.params.length) {
      throw new Error(
        `Cond placeholder/param mismatch: "${c.sql}" has ${placeholders} placeholder(s) but ${c.params.length} param(s)`,
      )
    }
    conds.push(c.sql)
    params.push(...c.params)
  }
  // Number the placeholders left-to-right.
  let i = 0
  const where = 'WHERE ' + conds.join(' AND ').replace(/\?/g, () => '$' + (++i))
  return { where, params }
}

// Per-client record-visibility gate for the columnar entities (people, companies,
// opportunities — all carry owner_id + assigned_to). Returns EXTRA conds to fold
// into buildWhere's `extra`. The DEFAULT 'team' path returns [] so the generated
// query is byte-for-byte identical to before this feature existed (zero regression).
// Only when a client opts into 'owner' AND the staff user is non-management do we
// restrict to records they own or are assigned. Portal callers never use this
// (clients already see only their own client's records).
export async function isOwnerScoped(clientId: string, user: User): Promise<boolean> {
  const settings = await queryOne<{ record_visibility: string }>(
    `SELECT record_visibility FROM crm_settings WHERE client_id = $1`,
    [clientId],
  )
  if (!settings || settings.record_visibility !== 'owner') return false
  return !hasRole(user, PERMISSIONS.MANAGEMENT)
}

export async function visibilityConds(clientId: string, user: User): Promise<Cond[]> {
  if (!(await isOwnerScoped(clientId, user))) return []
  return [{ sql: '(owner_id = ? OR assigned_to = ?)', params: [user.id, user.id] }]
}
