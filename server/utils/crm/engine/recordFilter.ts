// server/utils/crm/engine/recordFilter.ts
// Builds a parameterized WHERE for crm_records: always client + object scoped + soft-delete,
// plus an optional ILIKE title search across the object's title field keys (JSONB ->>).
// Wildcards in the search term are escaped (ILIKE-injection lesson).
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import type { RelationTarget } from './types'

export interface RecordFilterQuery {
  q?: string
  titleKeys?: string[]
  context?: CrmSearchContext
  relationFields?: Array<{ key: string; target: RelationTarget | null }>
}

export function buildRecordFilter(
  clientId: string,
  objectDefId: string,
  query: RecordFilterQuery,
): { where: string, params: unknown[] } {
  const conds: string[] = ['deleted_at IS NULL', 'client_id = $1', 'object_def_id = $2']
  const params: unknown[] = [clientId, objectDefId]

  const ownerScoped = query.context?.actorType === 'staff' && query.context.visibility.ownerScoped
  for (const field of query.relationFields ?? []) {
    if (!/^[a-z0-9_]+$/.test(field.key)) throw new Error('Invalid CRM relation field key')
    if (field.target !== 'person' && field.target !== 'company') {
      throw new Error(`Relation field "${field.key}" has no protected target`)
    }
    const table = field.target === 'person' ? 'crm_people' : 'crm_companies'
    let ownerSql = ''
    if (ownerScoped) {
      params.push(query.context!.actorId, query.context!.actorId)
      const ownerIdx = params.length - 1
      const assignedIdx = params.length
      ownerSql = `
               AND (relation_target.owner_id = $${ownerIdx} OR relation_target.assigned_to = $${assignedIdx})`
    }
    const value = `crm_records.data->>'${field.key}'`
    conds.push(`(
      ${value} IS NULL
      OR ${value} = ''
      OR (
        ${value} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM ${table} relation_target
           WHERE relation_target.id = (${value})::uuid
             AND relation_target.client_id = crm_records.client_id
             AND relation_target.deleted_at IS NULL${ownerSql}
        )
      )
    )`)
  }

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
