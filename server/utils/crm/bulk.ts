// server/utils/crm/bulk.ts
// F9 — builder + runner for bulk mutations. buildBulkOp returns a SET fragment
// (with `?` placeholders) + params, or null when the (entity, action) combo is
// unsupported. runBulk appends client + id-list scoping and executes — a single
// statement, so inherently atomic; rows of other clients are never matched.
import { execute } from '~~/server/utils/db'

export type BulkEntity = 'people' | 'companies' | 'opportunities'
export type BulkAction = 'assign' | 'tag' | 'untag' | 'status' | 'delete'

export const BULK_TABLE: Record<BulkEntity, string> = {
  people: 'crm_people',
  companies: 'crm_companies',
  opportunities: 'crm_opportunities',
}

// tags column only exists on people + companies.
const HAS_TAGS: Record<BulkEntity, boolean> = { people: true, companies: true, opportunities: false }

export interface BulkOp { setSql: string, params: unknown[] }

export function buildBulkOp(entity: BulkEntity, action: BulkAction, payload: Record<string, unknown>): BulkOp | null {
  switch (action) {
    case 'assign': {
      // null clears the assignee.
      const uid = payload.user_id == null ? null : String(payload.user_id)
      return { setSql: 'assigned_to = ?', params: [uid] }
    }
    case 'status': {
      const value = payload.value == null ? null : String(payload.value)
      const col = entity === 'opportunities' ? 'status' : 'lifecycle_stage'
      return { setSql: `${col} = ?`, params: [value] }
    }
    case 'tag': {
      if (!HAS_TAGS[entity]) return null
      const tags = asStringArray(payload.tags)
      if (!tags.length) return null
      return { setSql: 'tags = ARRAY(SELECT DISTINCT unnest(tags || ?::text[]))', params: [tags] }
    }
    case 'untag': {
      if (!HAS_TAGS[entity]) return null
      const tags = asStringArray(payload.tags)
      if (!tags.length) return null
      return { setSql: 'tags = ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest(?::text[]))', params: [tags] }
    }
    case 'delete':
      return { setSql: 'deleted_at = now()', params: [] }
    default:
      return null
  }
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim())
}

export interface BulkArgs {
  entity: BulkEntity
  action: BulkAction
  ids: string[]
  payload: Record<string, unknown>
}

/** Apply a bulk action to the caller's rows only. Returns the affected row count. */
export async function runBulk(clientId: string, args: BulkArgs): Promise<{ updated: number }> {
  const op = buildBulkOp(args.entity, args.action, args.payload)
  if (!op) throw createError({ statusCode: 400, statusMessage: `Unsupported bulk action "${args.action}" for ${args.entity}` })
  let i = 0
  const setSql = op.setSql.replace(/\?/g, () => `$${++i}`)
  const params: unknown[] = [...op.params]
  const cIdx = params.push(clientId)
  const idsIdx = params.push(args.ids)
  const sql = `UPDATE ${BULK_TABLE[args.entity]} SET ${setSql}, updated_at = now()
    WHERE client_id = $${cIdx} AND id = ANY($${idsIdx}) AND deleted_at IS NULL`
  const updated = await execute(sql, params)
  return { updated }
}
