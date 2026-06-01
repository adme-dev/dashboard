// server/utils/crm/audit.ts
// Field-level audit trail for CRM entities. diffFields is pure (TDD);
// recordFieldChanges persists the diff to crm_audit_log (best-effort).
import { execute } from '~~/server/utils/db'

export interface FieldChange { field: string, old_value: string | null, new_value: string | null }

// Normalise a value for comparison + storage. null / undefined / '' collapse to
// null (so "unset" states compare equal); objects/arrays compare by JSON form;
// other scalars by String().
function norm(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Pure: which whitelisted fields differ between before and after.
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: string[],
): FieldChange[] {
  const out: FieldChange[] = []
  for (const f of fields) {
    const o = norm(before?.[f])
    const n = norm(after?.[f])
    if (o !== n) out.push({ field: f, old_value: o, new_value: n })
  }
  return out
}

// Best-effort: diff + persist. Callers wrap in try/catch so an audit failure
// never rolls back the originating update.
export async function recordFieldChanges(opts: {
  clientId: string
  entityType: string
  entityId: string
  before: Record<string, unknown> | null | undefined
  after: Record<string, unknown> | null | undefined
  fields: string[]
  actor: string | null
}): Promise<void> {
  const changes = diffFields(opts.before, opts.after, opts.fields)
  if (!changes.length) return
  for (const c of changes) {
    await execute(
      `INSERT INTO crm_audit_log (client_id, entity_type, entity_id, field, old_value, new_value, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [opts.clientId, opts.entityType, opts.entityId, c.field, c.old_value, c.new_value, opts.actor],
    )
  }
}
