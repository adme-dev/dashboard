// server/utils/crm/engine/validateRecord.ts
// Validates a record's `data` object against its object's field definitions.
// Pure + DB-free: coerces by type, enforces required, validates options/format, and
// shape-checks relations (UUID format only — existence is verified at the DB layer
// where client scoping is available). Unknown keys are dropped.
import type { FieldType, RelationTarget } from './types'

export interface ValidatorFieldDef {
  key: string
  field_type: FieldType
  options: string[]
  relation_target: RelationTarget | null
  is_required: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

export function validateRecord(
  defs: ValidatorFieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const byKey = new Map(defs.map(d => [d.key, d]))
  const out: Record<string, unknown> = {}

  // First pass: required-field enforcement.
  for (const def of defs) {
    if (def.is_required && isEmpty(values?.[def.key])) {
      throw new Error(`Field "${def.key}" is required`)
    }
  }

  for (const [k, v] of Object.entries(values ?? {})) {
    const def = byKey.get(k)
    if (!def) continue // drop unknown
    if (isEmpty(v)) continue

    switch (def.field_type) {
      case 'number':
      case 'currency':
      case 'rating': {
        const n = Number(v)
        if (Number.isNaN(n)) throw new Error(`Invalid number for field "${k}"`)
        out[k] = n
        break
      }
      case 'checkbox': {
        out[k] = Boolean(v)
        break
      }
      case 'dropdown':
      case 'status': {
        if (def.options.length && !def.options.includes(String(v))) {
          throw new Error(`Invalid option for field "${k}"`)
        }
        out[k] = v
        break
      }
      case 'email': {
        if (!EMAIL_RE.test(String(v))) throw new Error(`Invalid email for field "${k}"`)
        out[k] = v
        break
      }
      case 'relation': {
        if (!UUID_RE.test(String(v))) throw new Error(`Invalid relation reference for field "${k}"`)
        out[k] = String(v)
        break
      }
      case 'tags': {
        out[k] = Array.isArray(v) ? v : [v]
        break
      }
      default:
        out[k] = v
    }
  }
  return out
}
