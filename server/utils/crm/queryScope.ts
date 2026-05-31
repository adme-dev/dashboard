// server/utils/crm/queryScope.ts
// Builds a parameterized WHERE that always enforces client scoping + soft-delete.

export interface Cond { sql: string, value: unknown }

export function buildWhere(clientId: string, extra: Cond[]): { where: string, params: unknown[] } {
  const conds: string[] = ['deleted_at IS NULL', 'client_id = ?']
  const params: unknown[] = [clientId]
  for (const c of extra) {
    conds.push(c.sql)
    params.push(c.value)
  }
  // Number the placeholders left-to-right.
  let i = 0
  const where = 'WHERE ' + conds.join(' AND ').replace(/\?/g, () => '$' + (++i))
  return { where, params }
}
