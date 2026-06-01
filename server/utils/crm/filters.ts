// server/utils/crm/filters.ts
// F9 — injection-safe filter grammar. Translates a list of {field, op, value}
// clauses into queryScope Conds. Columns are NEVER taken from user input: a field
// must resolve through the per-entity whitelist, and the operator must be valid
// for that field's type. Values are always parameterised; ILIKE wildcards escaped.
import type { Cond } from '~~/server/utils/crm/queryScope'

export type FilterEntity = 'people' | 'companies' | 'opportunities'
export type FilterType = 'text' | 'enum' | 'uuid' | 'array' | 'number' | 'date' | 'bool'

export interface FilterClause { field: string, op: string, value?: unknown }
interface FieldSpec { column: string, type: FilterType }

// Operators permitted per field type.
const OPS_BY_TYPE: Record<FilterType, Set<string>> = {
  text: new Set(['eq', 'neq', 'contains', 'is_empty', 'not_empty']),
  enum: new Set(['eq', 'neq', 'in', 'is_empty', 'not_empty']),
  uuid: new Set(['eq', 'neq', 'in', 'is_empty', 'not_empty']),
  array: new Set(['has', 'has_any', 'is_empty', 'not_empty']),
  number: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  date: new Set(['eq', 'before', 'after']),
  bool: new Set(['is_true', 'is_false']),
}

function f(column: string, type: FilterType): FieldSpec { return { column, type } }

export const FILTER_FIELDS: Record<FilterEntity, Record<string, FieldSpec>> = {
  people: {
    lifecycle_stage: f('lifecycle_stage', 'enum'),
    tags: f('tags', 'array'),
    owner_id: f('owner_id', 'uuid'),
    assigned_to: f('assigned_to', 'uuid'),
    company_id: f('company_id', 'uuid'),
    city: f('city', 'text'),
    job_title: f('job_title', 'text'),
    email: f('email', 'text'),
    do_not_contact: f('do_not_contact', 'bool'),
    created_at: f('created_at', 'date'),
  },
  companies: {
    lifecycle_stage: f('lifecycle_stage', 'enum'),
    tags: f('tags', 'array'),
    owner_id: f('owner_id', 'uuid'),
    assigned_to: f('assigned_to', 'uuid'),
    name: f('name', 'text'),
    domain: f('domain', 'text'),
    city: f('city', 'text'),
    created_at: f('created_at', 'date'),
  },
  opportunities: {
    stage_id: f('stage_id', 'uuid'),
    status: f('status', 'enum'),
    owner_id: f('owner_id', 'uuid'),
    assigned_to: f('assigned_to', 'uuid'),
    source: f('source', 'text'),
    amount: f('amount', 'number'),
    created_at: f('created_at', 'date'),
    expected_close_date: f('expected_close_date', 'date'),
  },
}

const escapeLike = (v: string) => '%' + v.replace(/[%_]/g, c => '\\' + c) + '%'
const CMP: Record<string, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=' }

/** Build Conds for one clause, or null if it fails validation (silently dropped). */
function condFor(spec: FieldSpec, op: string, value: unknown, alias: string): Cond | null {
  const { type } = spec
  const col = alias ? `${alias}.${spec.column}` : spec.column
  if (!OPS_BY_TYPE[type].has(op)) return null

  switch (op) {
    case 'eq': return value == null ? null : { sql: `${col} = ?`, params: [value] }
    case 'neq': return value == null ? null : { sql: `${col} <> ?`, params: [value] }
    case 'contains':
      return typeof value === 'string' ? { sql: `${col} ILIKE ?`, params: [escapeLike(value)] } : null
    case 'in':
    case 'has_any':
      if (!Array.isArray(value) || value.length === 0) return null
      return op === 'in' ? { sql: `${col} = ANY(?)`, params: [value] } : { sql: `${col} && ?`, params: [value] }
    case 'has':
      return value == null ? null : { sql: `? = ANY(${col})`, params: [value] }
    case 'gt': case 'gte': case 'lt': case 'lte':
      return typeof value === 'number' ? { sql: `${col} ${CMP[op]} ?`, params: [value] } : null
    case 'before': return value == null ? null : { sql: `${col} < ?`, params: [value] }
    case 'after': return value == null ? null : { sql: `${col} > ?`, params: [value] }
    case 'is_empty':
      if (type === 'text') return { sql: `(${col} IS NULL OR ${col} = '')`, params: [] }
      if (type === 'array') return { sql: `(${col} IS NULL OR cardinality(${col}) = 0)`, params: [] }
      return { sql: `${col} IS NULL`, params: [] }
    case 'not_empty':
      if (type === 'text') return { sql: `(${col} IS NOT NULL AND ${col} <> '')`, params: [] }
      if (type === 'array') return { sql: `(${col} IS NOT NULL AND cardinality(${col}) > 0)`, params: [] }
      return { sql: `${col} IS NOT NULL`, params: [] }
    case 'is_true': return { sql: `${col} = ?`, params: [true] }
    case 'is_false': return { sql: `${col} = ?`, params: [false] }
    default: return null
  }
}

/** Tolerantly parse a `filters` query param (JSON array of clauses) → never throws. */
export function parseFilters(raw: unknown): FilterClause[] {
  if (Array.isArray(raw)) return raw as FilterClause[]
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v as FilterClause[] : []
  } catch {
    return []
  }
}

/** `alias` prefixes every column (e.g. 'o' → `o.status`) for joined queries. */
export function buildFilterConds(entity: FilterEntity, clauses: FilterClause[] | undefined, alias = ''): Cond[] {
  if (!Array.isArray(clauses)) return []
  const fields = FILTER_FIELDS[entity]
  const out: Cond[] = []
  for (const cl of clauses) {
    const spec = cl && typeof cl.field === 'string' ? fields[cl.field] : undefined
    if (!spec) continue
    const cond = condFor(spec, cl.op, cl.value, alias)
    if (cond) out.push(cond)
  }
  return out
}
