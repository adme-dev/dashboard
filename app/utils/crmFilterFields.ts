// app/utils/crmFilterFields.ts
// UI descriptors for the F9 filter builder. Mirrors server/utils/crm/filters.ts —
// the server re-validates every clause, so this only drives the form. Date fields
// are intentionally omitted from v1 (calendar-per-row is deferred).
import type { CrmEntity } from '~/types/crm'

export type FilterFieldType = 'text' | 'enum' | 'uuid' | 'array' | 'number' | 'bool'

export interface FilterFieldDef {
  key: string
  label: string
  type: FilterFieldType
  options?: { label: string, value: string }[]
}

const LIFECYCLE_OPTS = [
  { label: 'Lead', value: 'lead' }, { label: 'Prospect', value: 'prospect' },
  { label: 'Active', value: 'active' }, { label: 'Customer', value: 'customer' },
  { label: 'Lost', value: 'lost' }, { label: 'Dormant', value: 'dormant' },
]
const STATUS_OPTS = [
  { label: 'Open', value: 'open' }, { label: 'Won', value: 'won' }, { label: 'Lost', value: 'lost' },
]

export const FILTER_FIELD_DEFS: Record<CrmEntity, FilterFieldDef[]> = {
  people: [
    { key: 'lifecycle_stage', label: 'Lifecycle', type: 'enum', options: LIFECYCLE_OPTS },
    { key: 'tags', label: 'Tags', type: 'array' },
    { key: 'job_title', label: 'Job title', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'do_not_contact', label: 'Do not contact', type: 'bool' },
    { key: 'owner_id', label: 'Owner', type: 'uuid' },
    { key: 'assigned_to', label: 'Assigned to', type: 'uuid' },
  ],
  companies: [
    { key: 'lifecycle_stage', label: 'Lifecycle', type: 'enum', options: LIFECYCLE_OPTS },
    { key: 'tags', label: 'Tags', type: 'array' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'domain', label: 'Domain', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'owner_id', label: 'Owner', type: 'uuid' },
  ],
  opportunities: [
    { key: 'status', label: 'Status', type: 'enum', options: STATUS_OPTS },
    { key: 'source', label: 'Source', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'owner_id', label: 'Owner', type: 'uuid' },
    { key: 'assigned_to', label: 'Assigned to', type: 'uuid' },
  ],
}

const OPS: Record<FilterFieldType, { value: string, label: string }[]> = {
  text: [
    { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }, { value: 'contains', label: 'contains' },
    { value: 'is_empty', label: 'is empty' }, { value: 'not_empty', label: 'is not empty' },
  ],
  enum: [
    { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }, { value: 'in', label: 'is any of' },
    { value: 'is_empty', label: 'is empty' }, { value: 'not_empty', label: 'is set' },
  ],
  uuid: [
    { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' },
    { value: 'is_empty', label: 'is unassigned' }, { value: 'not_empty', label: 'is assigned' },
  ],
  array: [
    { value: 'has', label: 'has' }, { value: 'has_any', label: 'has any of' },
    { value: 'is_empty', label: 'is empty' }, { value: 'not_empty', label: 'is set' },
  ],
  number: [
    { value: 'eq', label: '=' }, { value: 'neq', label: '≠' }, { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' }, { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
  ],
  bool: [{ value: 'is_true', label: 'is yes' }, { value: 'is_false', label: 'is no' }],
}

export function opsForType(type: FilterFieldType) { return OPS[type] }

/** What value control the clause needs: none (op carries the value), one value, or a list. */
export function valueKind(type: FilterFieldType, op: string): 'none' | 'single' | 'multi' {
  if (op === 'is_empty' || op === 'not_empty' || op === 'is_true' || op === 'is_false') return 'none'
  if (op === 'in' || op === 'has_any') return 'multi'
  return 'single'
}

export function fieldDef(entity: CrmEntity, key: string): FilterFieldDef | undefined {
  return FILTER_FIELD_DEFS[entity].find(f => f.key === key)
}
