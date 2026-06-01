// server/utils/crm/engine/recordFilter.ts
// Builds a parameterized WHERE for crm_records: always client + object scoped + soft-delete,
// plus an optional ILIKE title search across the object's title field keys (JSONB ->>).
// Wildcards in the search term are escaped (ILIKE-injection lesson).

export interface RecordFilterQuery {
  q?: string
  titleKeys?: string[]
}

export function buildRecordFilter(
  clientId: string,
  objectDefId: string,
  query: RecordFilterQuery,
): { where: string, params: unknown[] } {
  const conds: string[] = ['deleted_at IS NULL', 'client_id = $1', 'object_def_id = $2']
  const params: unknown[] = [clientId, objectDefId]

  const term = (query.q ?? '').trim()
  const keys = query.titleKeys ?? []
  if (term && keys.length) {
    const safe = term.replace(/[%_]/g, c => '\\' + c)
    const like = `%${safe}%`
    const ors = keys.map((k) => {
      params.push(like)
      // key is a validated field key (^[a-z0-9_]+$) — safe to inline; value is parameterized.
      return `data->>'${k}' ILIKE $${params.length}`
    })
    conds.push(`(${ors.join(' OR ')})`)
  }
  return { where: 'WHERE ' + conds.join(' AND '), params }
}
