// server/utils/crm/queryScope.ts
// Builds a parameterized WHERE that always enforces client scoping + soft-delete.

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
